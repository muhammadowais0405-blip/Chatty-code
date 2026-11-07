import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import type Database from 'better-sqlite3'
import type { ImportProgress, ImportResult, ImportStartInput, SourceFormat } from '@shared/types'
import { loadSettings } from '../settings'
import { detectFormat } from './detectFormat'
import { parseMessageWithMapping } from './parseByFieldMapping'
import { guessMimeType } from './mime'
import { sanitizeFilename } from './sanitizeFilename'
import { attachmentsRootForChat, findChatFile, resolveWorkingDir } from './resolveWorkingDir'
import { findDuplicateChat } from '../chats/chatsRepo'

/**
 * Tries to find an attachment file on disk, working through a priority
 * list of candidate locations.
 *
 * Priority:
 *  1. ST installation root + stripped server-relative path
 *     (only when sillytavernBasePath is configured)
 *  2. Ref resolved directly (absolute as-is, relative against workingDir)
 *  3. Just the filename inside workingDir/attachment/   ← typical ST export layout
 *  4. Just the filename inside workingDir/attachments/
 *  5. Just the filename at workingDir root
 *
 * So a folder structure like:
 *   MyChatExport/
 *     chat.jsonl   (refs contain /user/images/CharacterName/img.webp)
 *     attachment/
 *       img.webp   ← found at priority 3, no ST dir needed
 */
function findAttachmentOnDisk(
  ref: string,
  workingDir: string,
  sillytavernBasePath: string | null | undefined
): { resolvedPath: string; found: boolean; allTried: string[] } {
  const fileName = basename(ref)
  // Strip any leading slash/backslash so we can use it as a relative subpath
  const relativeRef = ref.replace(/^[\\/]/, '')
  const isStServerRef = /^[\\/]user[\\/]/.test(ref)
  const candidates: string[] = []

  // 1. ST base path + stripped server path
  if (isStServerRef && sillytavernBasePath) {
    candidates.push(join(sillytavernBasePath, relativeRef))
  }

  // 2. Direct resolution (absolute as-is, or relative to workingDir)
  if (isAbsolute(ref)) {
    candidates.push(ref)
  } else {
    candidates.push(join(workingDir, ref))
  }

  // 3. Just the filename in attachments/ (flat export layout)
  candidates.push(join(workingDir, 'attachments', fileName))
  candidates.push(join(workingDir, 'attachment', fileName))

  // 4. Full sub-path mirrored inside attachments/ or attachment/
  //    e.g. attachments/user/images/CharacterName/file.webp
  //    (some ST export extensions mirror the server directory structure)
  candidates.push(join(workingDir, 'attachments', relativeRef))
  candidates.push(join(workingDir, 'attachment', relativeRef))

  // 5. Filename at working dir root
  candidates.push(join(workingDir, fileName))

  const deduped = [...new Set(candidates)]
  for (const candidate of deduped) {
    if (existsSync(candidate)) return { resolvedPath: candidate, found: true, allTried: deduped }
  }
  return { resolvedPath: deduped[0], found: false, allTried: deduped }
}

export type ProgressReporter = (progress: ImportProgress) => void

function deriveTitle(
  headerObj: Record<string, unknown> | null,
  sourcePath: string,
  firstNonUserMessage: { senderName: string | null } | null
): { title: string; characterName: string | null; userName: string | null } {
  const headerCharacter = headerObj && typeof headerObj.character_name === 'string' ? headerObj.character_name : null
  const headerUser = headerObj && typeof headerObj.user_name === 'string' ? headerObj.user_name : null

  if (headerCharacter) {
    return { title: headerCharacter, characterName: headerCharacter, userName: headerUser }
  }
  if (firstNonUserMessage?.senderName) {
    return { title: firstNonUserMessage.senderName, characterName: firstNonUserMessage.senderName, userName: headerUser }
  }
  const base = basename(sourcePath).replace(/\.(zip|jsonl|txt)$/i, '')
  return { title: base || 'Imported chat', characterName: null, userName: headerUser }
}

/** Reads chat.jsonl/.txt as JSONL, tolerating blank lines. */
export function readJsonLines(path: string): unknown[] {
  const raw = readFileSync(path, 'utf-8')
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l))
}

export function importChat(
  db: Database.Database,
  input: ImportStartInput,
  onProgress?: ProgressReporter
): ImportResult {
  onProgress?.({ phase: 'reading', current: 0, total: 0 })

  const workingDir = resolveWorkingDir(input.sourcePath)
  const chatFilePath = findChatFile(workingDir)
  const lines = readJsonLines(chatFilePath)
  if (lines.length === 0) {
    throw new Error(`${chatFilePath} has no message lines`)
  }

  onProgress?.({ phase: 'parsing', current: 0, total: lines.length })

  const detected = detectFormat(lines)
  const format: SourceFormat = detected.format
  const messageLines = detected.hasHeaderLine ? lines.slice(1) : lines

  const settings = loadSettings()
  const mapping = format === 'unknown' ? null : settings.fieldMappings[format]

  // Parse every line up front so we can derive a title before opening the
  // transaction (needs a non-user sender as a fallback per §4.3 step 3).
  const parsedMessages = messageLines.map((line) =>
    mapping
      ? parseMessageWithMapping(line, mapping)
      : { text: null, senderName: null, isUser: 0 as const, sendDate: null, attachmentRefs: [], unmapped: true }
  )
  const firstNonUser = parsedMessages.find((m) => m.isUser === 0 && m.senderName) ?? null
  const { title, characterName, userName } = deriveTitle(
    detected.headerObj,
    input.sourcePath,
    firstNonUser
  )

  // Duplicate check — same matching rule as backup restore's merge
  // strategies (title + character_name + message_count). Skips the whole
  // transaction and writes nothing if a likely duplicate exists and the
  // caller hasn't confirmed forceDuplicate.
  if (!input.forceDuplicate) {
    const duplicate = findDuplicateChat(db, title, characterName, messageLines.length)
    if (duplicate) {
      onProgress?.({ phase: 'done', current: 0, total: messageLines.length })
      return {
        chatId: duplicate.id,
        messageCount: messageLines.length,
        attachmentCount: 0,
        missingCount: 0,
        unmappedFieldWarning: false,
        detectedFormat: format,
        sampleMissingAttachments: [],
        imported: false,
        duplicateOf: { chatId: duplicate.id, title: duplicate.title }
      }
    }
  }

  let unmappedFieldWarning = format === 'unknown'
  let missingCount = 0
  const sampleMissingAttachments: { ref: string; checkedPath: string }[] = []

  const runImport = db.transaction((): number => {
    const chatMetadata = detected.headerObj ? JSON.stringify(detected.headerObj) : null

    const chatInsert = db
      .prepare(
        `INSERT INTO chats
           (folder_id, title, source_format, character_name, user_name,
            message_count, attachment_count, chat_metadata, original_source_path)
         VALUES (@folder_id, @title, @source_format, @character_name, @user_name, 0, 0, @chat_metadata, @original_source_path)`
      )
      .run({
        folder_id: input.targetFolderId,
        title,
        source_format: format,
        character_name: characterName,
        user_name: userName,
        chat_metadata: chatMetadata,
        original_source_path: input.sourcePath
      })
    const chatId = Number(chatInsert.lastInsertRowid)

    const insertMessage = db.prepare(
      `INSERT INTO messages (chat_id, seq, sender_name, is_user, send_date, text, raw_json)
       VALUES (@chat_id, @seq, @sender_name, @is_user, @send_date, @text, @raw_json)`
    )
    const insertAttachment = db.prepare(
      `INSERT INTO attachments (message_id, label, original_ref, stored_path, mime_type, link_mode, missing)
       VALUES (@message_id, @label, @original_ref, @stored_path, @mime_type, @link_mode, @missing)`
    )

    let attachmentCount = 0
    const managedRoot = attachmentsRootForChat(chatId)
    if (!input.linkMode) mkdirSync(managedRoot, { recursive: true })

    messageLines.forEach((line, index) => {
      if (parsedMessages[index].unmapped) unmappedFieldWarning = true

      const parsed = parsedMessages[index]
      const msgResult = insertMessage.run({
        chat_id: chatId,
        seq: index,
        sender_name: parsed.senderName,
        is_user: parsed.isUser,
        send_date: parsed.sendDate,
        text: parsed.text,
        raw_json: JSON.stringify(line)
      })
      const messageId = Number(msgResult.lastInsertRowid)

      for (const ref of parsed.attachmentRefs) {
        const { resolvedPath: resolvedSourcePath, found: fileExists, allTried } = findAttachmentOnDisk(
          ref,
          workingDir,
          input.sillytavernBasePath
        )
        const label = basename(ref)
        let storedPath: string
        let missing: 0 | 1 = 0

        if (input.linkMode) {
          storedPath = resolvedSourcePath
          missing = fileExists ? 0 : 1
        } else if (fileExists) {
          const destName = sanitizeFilename(label)
          const destPath = join(managedRoot, destName)
          try {
            copyFileSync(resolvedSourcePath, destPath)
            storedPath = join(String(chatId), destName)
          } catch {
            storedPath = resolvedSourcePath
            missing = 1
          }
        } else {
          storedPath = resolvedSourcePath
          missing = 1
        }

        if (missing) {
          missingCount += 1
          if (sampleMissingAttachments.length < 3) {
            sampleMissingAttachments.push({ ref, checkedPath: allTried.join('\n  → ') })
          }
        }
        insertAttachment.run({
          message_id: messageId,
          label,
          original_ref: ref,
          stored_path: storedPath,
          mime_type: guessMimeType(label),
          link_mode: input.linkMode ? 1 : 0,
          missing
        })
        attachmentCount += 1
      }

      if (index % 25 === 0 || index === messageLines.length - 1) {
        onProgress?.({ phase: 'attachments', current: index + 1, total: messageLines.length })
      }
    })

    db.prepare(`UPDATE chats SET message_count = ?, attachment_count = ? WHERE id = ?`).run(
      messageLines.length,
      attachmentCount,
      chatId
    )

    return chatId
  })

  const chatId = runImport()

  onProgress?.({ phase: 'done', current: messageLines.length, total: messageLines.length })

  return {
    chatId,
    messageCount: messageLines.length,
    attachmentCount: parsedMessages.reduce((n, m) => n + m.attachmentRefs.length, 0),
    missingCount,
    unmappedFieldWarning,
    detectedFormat: format,
    sampleMissingAttachments,
    imported: true,
    duplicateOf: null
  }
}

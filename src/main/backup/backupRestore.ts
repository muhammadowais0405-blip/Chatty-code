import AdmZip from 'adm-zip'
import type Database from 'better-sqlite3'
import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BackupCheckResult, BackupRestoreInput, MergeStrategy, RestoreResult } from '@shared/types'
import { sanitizeFilename } from '../import/sanitizeFilename'
import { readTextFile } from '../utils/readTextFile'

const SUPPORTED_VERSIONS = [1]

interface FolderRow {
  id: number
  parent_id: number | null
  name: string
  position: number
  color: string | null
  icon: string | null
  is_system: 0 | 1
  is_trashed?: 0 | 1
}
interface ChatBundle {
  chat: Record<string, unknown>
  messages: Record<string, unknown>[]
  attachments: Record<string, unknown>[]
  tagIds?: number[]
}
interface PromptSetRow {
  id: number
  name: string
}
interface PromptBlockRow {
  id: number
  set_id: number
  name: string
  role: string
  content: string
  enabled: number
  position: number
}

function readJson(tempDir: string, relativePath: string): unknown {
  const full = join(tempDir, relativePath)
  if (!existsSync(full)) return null
  return JSON.parse(readTextFile(full))
}

/** Pre-restore check: returns manifest info and a preview without writing anything. */
export function checkBackup(sourcePath: string): BackupCheckResult {
  const tempDir = mkdtempSync(join(tmpdir(), 'chat-archiver-check-'))
  try {
    const zip = new AdmZip(sourcePath)
    zip.extractAllTo(tempDir, true)

    const manifest = readJson(tempDir, 'manifest.json') as Record<string, unknown> | null
    if (!manifest) {
      return { valid: false, error: 'No manifest.json — not a valid backup', manifest: null, previewTitles: [] }
    }
    if (!SUPPORTED_VERSIONS.includes(manifest.version as number)) {
      return { valid: false, error: `Unsupported backup version ${manifest.version}`, manifest: null, previewTitles: [] }
    }

    const previewTitles: string[] = []
    const chatDirs = zip
      .getEntries()
      .filter((e) => e.entryName.match(/^chats\/\d+\/chat\.json$/))
      .slice(0, 5)
    for (const entry of chatDirs) {
      const bundle = readJson(tempDir, entry.entryName) as ChatBundle | null
      if (bundle?.chat?.title) previewTitles.push(bundle.chat.title as string)
    }

    return {
      valid: true,
      manifest: {
        version: manifest.version as number,
        exportedAt: manifest.exportedAt as string,
        chatCount: manifest.chatCount as number,
        fileCount: manifest.fileCount as number,
        hasPrompts: !!manifest.hasPrompts,
        hasTags: !!manifest.hasTags
      },
      previewTitles
    }
  } catch (err) {
    return { valid: false, error: String(err), manifest: null, previewTitles: [] }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function remapFolders(db: Database.Database, backupFolders: FolderRow[]): Map<number, number> {
  const remap = new Map<number, number>()
  const byId = new Map(backupFolders.map((f) => [f.id, f]))

  // Process parents before children, however deep the nesting goes.
  const depth = (f: FolderRow): number => {
    let d = 0
    let cur: FolderRow | undefined = f
    const seen = new Set<number>()
    while (cur && cur.parent_id !== null && !seen.has(cur.id)) {
      seen.add(cur.id)
      d += 1
      cur = byId.get(cur.parent_id)
    }
    return d
  }
  const sorted = [...backupFolders].sort((a, b) => depth(a) - depth(b))

  for (const f of sorted) {
    if (f.is_system || f.is_trashed) continue // don't resurrect deleted folders
    const remappedParentId = f.parent_id === null ? null : (remap.get(f.parent_id) ?? null)
    const existing = db
      .prepare(`SELECT id FROM folders WHERE name = ? AND (parent_id IS ? OR parent_id = ?) AND is_trashed = 0`)
      .get(f.name, remappedParentId, remappedParentId) as { id: number } | undefined
    if (existing) {
      remap.set(f.id, existing.id)
    } else {
      const next = (
        db
          .prepare(`SELECT COALESCE(MAX(position),-1)+1 AS n FROM folders WHERE parent_id IS ?`)
          .get(remappedParentId) as { n: number }
      ).n
      const r = db
        .prepare(`INSERT INTO folders (parent_id, name, position, color, icon) VALUES (?,?,?,?,?)`)
        .run(remappedParentId, f.name, next, f.color, f.icon)
      remap.set(f.id, Number(r.lastInsertRowid))
    }
  }
  return remap
}

function findExistingChat(
  db: Database.Database,
  bundle: ChatBundle,
  strategy: MergeStrategy
): { action: 'skip' | 'replace' | 'insert'; existingId?: number } {
  if (strategy === 'duplicate') return { action: 'insert' }
  const existing = db
    .prepare(`SELECT id FROM chats WHERE title = ? AND character_name IS ? AND message_count = ? AND is_trashed = 0`)
    .get(bundle.chat.title, bundle.chat.character_name ?? null, bundle.messages.length) as
    | { id: number }
    | undefined
  if (!existing) return { action: 'insert' }
  if (strategy === 'skip') return { action: 'skip' }
  return { action: 'replace', existingId: existing.id }
}

export function restoreBackup(db: Database.Database, input: BackupRestoreInput): RestoreResult {
  const tempDir = mkdtempSync(join(tmpdir(), 'chat-archiver-restore-'))
  try {
    return restoreFromDir(db, input, tempDir)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function restoreFromDir(db: Database.Database, input: BackupRestoreInput, tempDir: string): RestoreResult {
  const zip = new AdmZip(input.sourcePath)
  zip.extractAllTo(tempDir, true)

  const manifest = readJson(tempDir, 'manifest.json') as { version: number } | null
  if (!manifest) throw new Error('Not a valid Chat Archiver backup (no manifest.json)')
  if (!SUPPORTED_VERSIONS.includes(manifest.version)) {
    throw new Error(`Backup version ${manifest.version} not supported`)
  }

  const backupFolders = (readJson(tempDir, 'folders.json') as FolderRow[] | null) ?? []
  const tagsData = readJson(tempDir, 'tags.json') as {
    tags: { id: number; name: string; color: string | null }[]
    chatTags: { chat_id: number; tag_id: number }[]
  } | null
  const backupPromptsFile = readJson(tempDir, 'prompts.json') as
    | { promptSets: PromptSetRow[]; promptBlocks: PromptBlockRow[] }
    | null
  const backupPromptSets = backupPromptsFile?.promptSets ?? []
  const backupPromptBlocks = backupPromptsFile?.promptBlocks ?? []

  let chatsImported = 0
  let chatsSkipped = 0
  let chatsReplaced = 0
  let foldersCreated = 0
  let tagsRestored = 0
  let promptsImported = 0
  const replacedChatIds: number[] = []

  const run = db.transaction(() => {
    // ---- folders ----
    const folderCountBefore = (db.prepare(`SELECT COUNT(*) AS n FROM folders`).get() as { n: number }).n
    const folderRemap = remapFolders(db, backupFolders)
    foldersCreated =
      (db.prepare(`SELECT COUNT(*) AS n FROM folders`).get() as { n: number }).n - folderCountBefore

    // ---- tags ----
    const tagIdRemap = new Map<number, number>()
    if (tagsData) {
      for (const tag of tagsData.tags) {
        const existing = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(tag.name) as
          | { id: number }
          | undefined
        if (existing) {
          tagIdRemap.set(tag.id, existing.id)
        } else {
          const r = db.prepare(`INSERT INTO tags (name, color) VALUES (?,?)`).run(tag.name, tag.color)
          tagIdRemap.set(tag.id, Number(r.lastInsertRowid))
          tagsRestored += 1
        }
      }
    }

    // ---- prompt sets + blocks ----
    // Whole-set granularity: skip a set entirely if one with the same name
    // already exists, else recreate the set and every block inside it.
    for (const set of backupPromptSets) {
      const existingSet = db.prepare(`SELECT id FROM prompt_sets WHERE name = ?`).get(set.name)
      if (existingSet) continue

      const setResult = db.prepare(`INSERT INTO prompt_sets (name) VALUES (?)`).run(set.name)
      const newSetId = Number(setResult.lastInsertRowid)

      const blocksForSet = backupPromptBlocks
        .filter((b) => b.set_id === set.id)
        .sort((a, b) => a.position - b.position)

      for (const block of blocksForSet) {
        db.prepare(
          `INSERT INTO prompt_blocks (set_id, name, role, content, enabled, position)
           VALUES (?,?,?,?,?,?)`
        ).run(newSetId, block.name, block.role, block.content, block.enabled, block.position)
        promptsImported += 1
      }
    }

    // ---- chats ----
    const chatDirs = zip
      .getEntries()
      .map((e) => e.entryName.match(/^chats\/(\d+)\/chat\.json$/)?.[1] ?? null)
      .filter((id): id is string => id !== null)
      .filter((id, i, arr) => arr.indexOf(id) === i)

    for (const chatIdStr of chatDirs) {
      const bundle = readJson(tempDir, `chats/${chatIdStr}/chat.json`) as ChatBundle | null
      if (!bundle) continue

      const { action, existingId } = findExistingChat(db, bundle, input.mergeStrategy)
      if (action === 'skip') {
        chatsSkipped += 1
        continue
      }
      if (action === 'replace' && existingId !== undefined) {
        db.prepare(`DELETE FROM chats WHERE id = ?`).run(existingId)
        replacedChatIds.push(existingId) // its attachment folder is removed after commit
        chatsReplaced += 1
      }

      const originalFolderId = typeof bundle.chat.folder_id === 'number' ? bundle.chat.folder_id : null
      const remappedFolderId = originalFolderId === null ? null : (folderRemap.get(originalFolderId) ?? null)

      const chatResult = db
        .prepare(
          `INSERT INTO chats (folder_id, title, source_format, character_name, user_name, message_count, attachment_count, chat_metadata, original_source_path, imported_at)
           VALUES (?,?,?,?,?,?,0,?,?,?)`
        )
        .run(
          remappedFolderId,
          bundle.chat.title,
          bundle.chat.source_format,
          bundle.chat.character_name ?? null,
          bundle.chat.user_name ?? null,
          bundle.messages.length,
          bundle.chat.chat_metadata ?? null,
          bundle.chat.original_source_path ?? null,
          bundle.chat.imported_at ?? new Date().toISOString()
        )
      const newChatId = Number(chatResult.lastInsertRowid)

      // messages
      const insertMsg = db.prepare(
        `INSERT INTO messages (chat_id, seq, sender_name, is_user, send_date, text, raw_json) VALUES (?,?,?,?,?,?,?)`
      )
      const msgIdMap = new Map<number, number>()
      for (const msg of bundle.messages) {
        const r = insertMsg.run(
          newChatId,
          msg.seq,
          msg.sender_name ?? null,
          msg.is_user ?? 0,
          msg.send_date ?? null,
          msg.text ?? null,
          msg.raw_json
        )
        if (typeof msg.id === 'number') msgIdMap.set(msg.id, Number(r.lastInsertRowid))
      }

      // attachments
      const managedRoot = join(app.getPath('userData'), 'attachments', String(newChatId))
      mkdirSync(managedRoot, { recursive: true })
      const insertAtt = db.prepare(
        `INSERT INTO attachments (message_id, label, original_ref, stored_path, mime_type, link_mode, missing) VALUES (?,?,?,?,?,?,?)`
      )
      let attachmentCount = 0
      for (const att of bundle.attachments) {
        const newMsgId = typeof att.message_id === 'number' ? msgIdMap.get(att.message_id) : undefined
        if (!newMsgId) continue
        const attFilename =
          typeof att.stored_path === 'string'
            ? (att.stored_path.split(/[\\/]/).pop() ?? String(att.id))
            : String(att.id)
        const backedUpPath = join(tempDir, 'chats', chatIdStr, 'attachments', attFilename)
        const sanitized = sanitizeFilename(attFilename)
        const destPath = join(managedRoot, sanitized)
        let missing = 1
        if (existsSync(backedUpPath)) {
          try {
            copyFileSync(backedUpPath, destPath)
            missing = 0
          } catch {
            /* leave missing */
          }
        }
        insertAtt.run(
          newMsgId,
          att.label ?? null,
          att.original_ref ?? null,
          missing === 0 ? join(String(newChatId), sanitized) : (att.stored_path ?? ''),
          att.mime_type ?? null,
          // a restored file now lives in managed storage, so it is never "link mode"
          missing === 0 ? 0 : (att.link_mode ?? 0),
          missing
        )
        if (missing === 0) attachmentCount += 1
      }
      db.prepare(`UPDATE chats SET attachment_count = ? WHERE id = ?`).run(attachmentCount, newChatId)

      // tag assignments
      if (bundle.tagIds && Array.isArray(bundle.tagIds)) {
        for (const backupTagId of bundle.tagIds) {
          const newTagId = tagIdRemap.get(backupTagId)
          if (newTagId) {
            db.prepare(`INSERT OR IGNORE INTO chat_tags (chat_id, tag_id) VALUES (?,?)`).run(newChatId, newTagId)
          }
        }
      }
      // also restore from the global chatTags list (older backup format compat)
      if (tagsData) {
        for (const ct of tagsData.chatTags) {
          if (String(ct.chat_id) === chatIdStr) {
            const newTagId = tagIdRemap.get(ct.tag_id)
            if (newTagId) {
              db.prepare(`INSERT OR IGNORE INTO chat_tags (chat_id, tag_id) VALUES (?,?)`).run(newChatId, newTagId)
            }
          }
        }
      }

      chatsImported += 1
    }
  })

  run()

  // Only after the transaction committed: delete the files of replaced chats.
  for (const id of replacedChatIds) {
    rmSync(join(app.getPath('userData'), 'attachments', String(id)), { recursive: true, force: true })
  }

  return { chatsImported, chatsSkipped, chatsReplaced, foldersCreated, tagsRestored, promptsImported }
}
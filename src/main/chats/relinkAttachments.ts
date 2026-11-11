
import type Database from 'better-sqlite3'

import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'

import { basename, join } from 'node:path'

import { app } from 'electron'

import type { RelinkAttachmentsInput, RelinkAttachmentsResult } from '@shared/types'

import { sanitizeFilename } from '../import/sanitizeFilename'

import { guessMimeType } from '../import/mime'

import { uniqueDestPath } from '../utils/uniqueDestPath'

interface MissingRow {
  id: number
  label: string | null
  original_ref: string | null
  raw_json: string  // raw message JSON — used to extract title hint
}

/**
 * Recursively collects every file in `dir` into a Map<lowercaseFilename, fullPath>.
 * When there are duplicates (same name in different subfolders), first one wins.
 */
function buildFileMap(dir: string): Map<string, string> {
  const map = new Map<string, string>()
  function walk(current: string): void {
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return
    }
    for (const name of entries) {
      const full = join(current, name)
      // try to recurse; if it fails (it's a file) just add it
      const subEntries = (() => { try { return readdirSync(full) } catch { return null } })()
      if (subEntries !== null) {
        walk(full)
      } else {
        const key = name.toLowerCase()
        if (!map.has(key)) map.set(key, full)
      }
    }
  }
  walk(dir)
  return map
}

/**
 * Extracts the `title` hint from the message's raw JSON for a given
 * attachment URL.  SillyTavern stores the user-visible original filename
 * in extra.media[N].title alongside the server-relative URL in .url.
 *
 * e.g. url  = /user/images/CharName/1784752505169_123.jpg
 *      title = 001 (1).jpg          ← what the user uploaded
 *
 * The export extension then names the file msg-0002-001 (1).png,
 * so "001 (1)" is a suffix of the final filename.
 *
 */
function extractTitleHint(rawJson: string, originalRef: string | null): string | null {
  if (!originalRef) return null
  try {
    const obj = JSON.parse(rawJson) as Record<string, unknown>
    const media = (obj?.extra as Record<string, unknown>)?.media
    if (!Array.isArray(media)) return null
    const match = (media as Array<{ url?: string; title?: string }>).find(
      (m) => m?.url === originalRef
    )
    return match?.title ?? null
  } catch {
    return null
  }
}

/** Look up by exact filename (case-insensitive). */
function findExact(fileMap: Map<string, string>, name: string): string | null {
  return fileMap.get(name.toLowerCase()) ?? null
}

/**
 * Look up by suffix: find a file whose name (without extension) ENDS WITH
 * the hint (without extension).
 * e.g. hint "001 (1).jpg" → look for files ending with "001 (1)"
 * Matches "msg-0002-001 (1).png" ✓
 */
function findBySuffix(fileMap: Map<string, string>, hint: string): string | null {
  const hintStem = hint.replace(/\.[^.]+$/, '').toLowerCase().trim()
  if (hintStem.length < 3) return null
  for (const [filename, fullPath] of fileMap) {
    const stem = filename.replace(/\.[^.]+$/, '')
    if (stem === hintStem || stem.endsWith(hintStem) || stem.endsWith('-' + hintStem)) {
      return fullPath
    }
  }
  return null
}

export function relinkAttachments(
  db: Database.Database,
  input: RelinkAttachmentsInput
): RelinkAttachmentsResult {
  // Fetch missing attachments with their message's raw_json for title extraction
  const missingRows = db
    .prepare(
      `SELECT a.id, a.label, a.original_ref, m.raw_json
         FROM attachments a
         JOIN messages m ON m.id = a.message_id
        WHERE m.chat_id = ? AND a.missing = 1`
    )
    .all(input.chatId) as MissingRow[]

  if (missingRows.length === 0) return { relinked: 0, stillMissing: 0 }

  const fileMap = buildFileMap(input.folderPath)

  const managedRoot = join(app.getPath('userData'), 'attachments', String(input.chatId))
  mkdirSync(managedRoot, { recursive: true })

  const updateAttachment = db.prepare(
    `UPDATE attachments SET stored_path = ?, mime_type = ?, link_mode = 0, missing = 0 WHERE id = ?`
  )

  let relinked = 0

  const run = db.transaction(() => {
    for (const row of missingRows) {
      const refSource = row.original_ref ?? row.label ?? ''
      const titleHint = extractTitleHint(row.raw_json, row.original_ref)

      // Try: 1) exact basename of ref, 2) title hint suffix match, 3) exact title
      const foundPath =
        findExact(fileMap, basename(refSource)) ??
        (titleHint ? findBySuffix(fileMap, titleHint) : null) ??
        (titleHint ? findExact(fileMap, titleHint) : null)

      if (!foundPath) continue

      try {
        const { destName, destPath } = uniqueDestPath(
          managedRoot,
          sanitizeFilename(basename(foundPath))
        )
        copyFileSync(foundPath, destPath)
        const storedPath = join(String(input.chatId), destName)
        const mime = guessMimeType(destName)
        updateAttachment.run(storedPath, mime, row.id)
        relinked += 1
      } catch {
        // skip files we can't copy
      }
    }
  })
  run()

  // Refresh attachment_count on the chat
  db.prepare(
    `UPDATE chats SET attachment_count = (
       SELECT COUNT(*) FROM attachments a
         JOIN messages m ON m.id = a.message_id
        WHERE m.chat_id = ? AND a.missing = 0
     ) WHERE id = ?`
  ).run(input.chatId, input.chatId)

  return { relinked, stillMissing: missingRows.length - relinked }
}

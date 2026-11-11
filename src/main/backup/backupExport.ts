
import archiver from 'archiver'
import type Database from 'better-sqlite3'
import { app } from 'electron'
import { createWriteStream, existsSync, renameSync, unlinkSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { BackupExportInput, BackupExportResult } from '@shared/types'

const BACKUP_VERSION = 1

interface AttachmentRow {
  id: number
  message_id: number
  label: string | null
  original_ref: string | null
  stored_path: string
  mime_type: string | null
  link_mode: 0 | 1
  missing: 0 | 1
}

function resolveAttachmentPath(row: AttachmentRow): string {
  if (row.link_mode === 0 && !isAbsolute(row.stored_path)) {
    return join(app.getPath('userData'), 'attachments', row.stored_path)
  }
  return row.stored_path
}

function selectChats(db: Database.Database, input: BackupExportInput) {
  if (input.scope === 'all') {
    return db.prepare(`SELECT * FROM chats WHERE is_trashed = 0`).all()
  }
  // folder-based scope
  const folderIds = input.scope.folderIds
  const hasNull = folderIds.includes(null)
  const numericIds = folderIds.filter((id): id is number => id !== null)

  const clauses: string[] = []
  if (hasNull) clauses.push(`folder_id IS NULL`)
  if (numericIds.length > 0)
    clauses.push(`folder_id IN (${numericIds.map(() => '?').join(',')})`)

  const where = clauses.length > 0 ? `(${clauses.join(' OR ')})` : '1=0'
  return db
    .prepare(`SELECT * FROM chats WHERE is_trashed = 0 AND ${where}`)
    .all(...numericIds)
}

export function exportBackup(
  db: Database.Database,
  input: BackupExportInput
): Promise<BackupExportResult> {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const prefix = input.filePrefix ?? 'backup'
    const destPath = join(input.destPath, `${prefix}-${timestamp}.zip`)
    const tmpPath = `${destPath}.tmp` // renamed to .zip only once fully written

    const output = createWriteStream(tmpPath)
    const archive = archiver('zip', { zlib: { level: 6 } })

    const fail = (err: Error): void => {
      try {
        unlinkSync(tmpPath)
      } catch {
        /* ignore */
      }
      reject(err)
    }
    archive.on('error', fail)
    output.on('error', fail)
    output.on('close', () => {
      try {
        renameSync(tmpPath, destPath)
        resolve({ path: destPath, chatCount, fileCount })
      } catch (err) {
        fail(err as Error)
      }
    })

    archive.pipe(output)

    // ---- folders ----
    const folders = db.prepare(`SELECT * FROM folders`).all()
    archive.append(JSON.stringify(folders, null, 2), { name: 'folders.json' })

    // ---- tags + chat_tag assignments ----
    const tags = db.prepare(`SELECT * FROM tags`).all()
    const chatTags = db.prepare(`SELECT * FROM chat_tags`).all()
    archive.append(JSON.stringify({ tags, chatTags }, null, 2), { name: 'tags.json' })

    // ---- prompt sets + blocks ----
    const promptSets = db.prepare(`SELECT * FROM prompt_sets ORDER BY created_at ASC`).all()
    const promptBlocks = db.prepare(`SELECT * FROM prompt_blocks ORDER BY set_id ASC, position ASC`).all()
    archive.append(JSON.stringify({ promptSets, promptBlocks }, null, 2), { name: 'prompts.json' })

    // ---- chats ----
    const chatRows = selectChats(db, input)
    let chatCount = 0
    let fileCount = 0
    const addedEntries = new Set<string>()

    for (const chat of chatRows as { id: number }[]) {
      const messages = db
        .prepare(`SELECT * FROM messages WHERE chat_id = ? ORDER BY seq ASC`)
        .all(chat.id)

      const attachments = db
        .prepare(
          `SELECT a.* FROM attachments a
             JOIN messages m ON m.id = a.message_id
            WHERE m.chat_id = ? ORDER BY m.seq ASC, a.id ASC`
        )
        .all(chat.id) as AttachmentRow[]

      // Include tag assignments for this chat
      const tags = db
        .prepare(`SELECT tag_id FROM chat_tags WHERE chat_id = ?`)
        .all(chat.id) as { tag_id: number }[]

      archive.append(JSON.stringify({ chat, messages, attachments, tagIds: tags.map(t => t.tag_id) }, null, 2), {
        name: `chats/${(chat as { id: number }).id}/chat.json`
      })

      for (const att of attachments) {
        const shouldCopy =
          att.missing === 0 &&
          (att.link_mode === 0 || input.includeLinkMode)
        if (!shouldCopy) continue

        const diskPath = resolveAttachmentPath(att)
        if (!existsSync(diskPath)) continue

        const filename = att.stored_path.split(/[\\/]/).pop() ?? String(att.id)
        const entryName = `chats/${(chat as { id: number }).id}/attachments/${filename}`
        if (addedEntries.has(entryName)) continue // legacy rows sharing one file
        addedEntries.add(entryName)
        archive.file(diskPath, { name: entryName })
        fileCount += 1
      }

      chatCount += 1
    }

    const manifest = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      folderCount: folders.length,
      chatCount,
      fileCount,
      hasPrompts: (promptSets as unknown[]).length > 0,
      hasTags: tags.length > 0
    }
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })

    archive.finalize()
  })
}

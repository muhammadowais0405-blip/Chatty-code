import type Database from 'better-sqlite3'
import type {
  Chat,
  ChatDetail,
  ChatSummary,
  FolderView,
  Message,
  MoveChatInput,
  RenameChatInput
} from '@shared/types'

// GROUP_CONCAT subquery that adds tagSummary to every chat row.
const TAG_SUBQUERY = `
  (SELECT GROUP_CONCAT(t.id || '|' || t.name || '|' || COALESCE(t.color,''), ',')
     FROM chat_tags ct JOIN tags t ON t.id = ct.tag_id
    WHERE ct.chat_id = c.id) AS tagSummary
`

const THUMBNAIL_SUBQUERY = `
  (SELECT a.id FROM attachments a
     JOIN messages m ON m.id = a.message_id
    WHERE m.chat_id = c.id AND a.missing = 0 AND a.mime_type LIKE 'image/%'
    ORDER BY m.seq ASC, a.id ASC
    LIMIT 1) AS thumbnailAttachmentId
`

const SUMMARY_COLS = `c.id, c.folder_id, c.title, c.character_name, c.message_count,
  c.attachment_count, c.imported_at, c.is_trashed, ${THUMBNAIL_SUBQUERY}, ${TAG_SUBQUERY}`

export function listChatsByFolder(db: Database.Database, view: FolderView): ChatSummary[] {
  if (view === 'all') {
    return db
      .prepare(`SELECT ${SUMMARY_COLS} FROM chats c WHERE c.is_trashed = 0 ORDER BY c.imported_at DESC`)
      .all() as ChatSummary[]
  }
  if (view === 'trash') {
    return db
      .prepare(`SELECT ${SUMMARY_COLS} FROM chats c WHERE c.is_trashed = 1 ORDER BY c.trashed_at DESC`)
      .all() as ChatSummary[]
  }
  return db
    .prepare(`SELECT ${SUMMARY_COLS} FROM chats c WHERE c.folder_id = ? AND c.is_trashed = 0 ORDER BY c.imported_at DESC`)
    .all(view) as ChatSummary[]
}

export function listChatsByTag(db: Database.Database, tagId: number): ChatSummary[] {
  return db
    .prepare(
      `SELECT ${SUMMARY_COLS}
         FROM chats c
         JOIN chat_tags ct ON ct.chat_id = c.id
        WHERE ct.tag_id = ? AND c.is_trashed = 0
        ORDER BY c.imported_at DESC`
    )
    .all(tagId) as ChatSummary[]
}

export function getChatDetail(db: Database.Database, chatId: number): ChatDetail {
  const chat = db.prepare(`SELECT * FROM chats WHERE id = ?`).get(chatId) as Chat | undefined
  if (!chat) throw new Error(`Chat ${chatId} not found`)

  const messages = db
    .prepare(`SELECT * FROM messages WHERE chat_id = ? ORDER BY seq ASC`)
    .all(chatId) as Message[]

  const attachments =
    messages.length === 0
      ? []
      : db
          .prepare(
            `SELECT a.* FROM attachments a
               JOIN messages m ON m.id = a.message_id
              WHERE m.chat_id = ?
              ORDER BY m.seq ASC, a.id ASC`
          )
          .all(chatId)

  return { chat, messages, attachments: attachments as ChatDetail['attachments'] }
}

/** Same matching rule used by backup restore's merge strategies: title +
 *  character_name + message_count, non-trashed only. Used by the import
 *  pipeline to warn before creating an accidental second copy. */
export function findDuplicateChat(
  db: Database.Database,
  title: string,
  characterName: string | null,
  messageCount: number
): { id: number; title: string } | null {
  const row = db
    .prepare(
      `SELECT id, title FROM chats
        WHERE title = ? AND character_name IS ? AND message_count = ? AND is_trashed = 0`
    )
    .get(title, characterName, messageCount) as { id: number; title: string } | undefined
  return row ?? null
}

export function moveChat(db: Database.Database, input: MoveChatInput): void {
  db.prepare(`UPDATE chats SET folder_id = ? WHERE id = ?`).run(input.targetFolderId, input.chatId)
}

export function renameChat(db: Database.Database, input: RenameChatInput): void {
  const title = input.title.trim() || 'Untitled chat'
  db.prepare(`UPDATE chats SET title = ? WHERE id = ?`).run(title, input.chatId)
}

/** Turns user input into an FTS5 query: every word becomes a quoted prefix
 *  term ("roof"* matches "rooftop") and all words must match (implicit AND). */
function toFtsQuery(input: string): string | null {
  const words = input.split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  return words.map((w) => `"${w.replace(/"/g, '""')}"*`).join(' ')
}

/** Searches chat titles, character names and message text via FTS5
 *  (migration 002 always creates the tables). */
export function searchChats(db: Database.Database, query: string): ChatSummary[] {
  const term = toFtsQuery(query)
  if (!term) return []
  try {
    return db
      .prepare(
        `SELECT ${SUMMARY_COLS}
           FROM chats c
          WHERE c.is_trashed = 0
            AND (
              c.id IN (SELECT rowid FROM chats_fts WHERE chats_fts MATCH ?)
              OR c.id IN (
                SELECT m.chat_id FROM messages m
                 WHERE m.id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)
              )
            )
          ORDER BY c.imported_at DESC
          LIMIT 200`
      )
      .all(term, term) as ChatSummary[]
  } catch {
    return [] // malformed FTS expression: treat as "no results"
  }
}

export function trashChat(db: Database.Database, chatId: number): void {
  db.prepare(`UPDATE chats SET is_trashed = 1, trashed_at = datetime('now') WHERE id = ?`).run(chatId)
}

export function restoreChat(db: Database.Database, chatId: number): void {
  const chat = db.prepare(`SELECT folder_id FROM chats WHERE id = ?`).get(chatId) as
    | { folder_id: number | null }
    | undefined
  if (!chat) throw new Error(`Chat ${chatId} not found`)

  let folderId = chat.folder_id
  if (folderId !== null) {
    const folder = db.prepare(`SELECT is_trashed FROM folders WHERE id = ?`).get(folderId) as
      | { is_trashed: number }
      | undefined
    if (!folder || folder.is_trashed) folderId = null
  }

  db.prepare(`UPDATE chats SET is_trashed = 0, trashed_at = NULL, folder_id = ? WHERE id = ?`).run(
    folderId,
    chatId
  )
}

export function deleteChatRow(db: Database.Database, chatId: number): void {
  db.prepare(`DELETE FROM chats WHERE id = ?`).run(chatId)
}

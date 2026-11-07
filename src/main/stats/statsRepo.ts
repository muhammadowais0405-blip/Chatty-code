import type Database from 'better-sqlite3'
import type { LibraryStats } from '@shared/types'

export function computeLibraryStats(db: Database.Database): LibraryStats {
  const totalChats = (
    db.prepare(`SELECT COUNT(*) AS n FROM chats WHERE is_trashed = 0`).get() as { n: number }
  ).n

  const trashedCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM chats WHERE is_trashed = 1`).get() as { n: number }
  ).n

  const totalMessages = (
    db
      .prepare(`SELECT COALESCE(SUM(message_count), 0) AS n FROM chats WHERE is_trashed = 0`)
      .get() as { n: number }
  ).n

  const totalAttachments = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM attachments a
           JOIN messages m ON m.id = a.message_id
           JOIN chats c ON c.id = m.chat_id
          WHERE a.missing = 0 AND c.is_trashed = 0`
      )
      .get() as { n: number }
  ).n

  const totalFolders = (
    db.prepare(`SELECT COUNT(*) AS n FROM folders WHERE is_trashed = 0`).get() as { n: number }
  ).n

  const totalTags = (db.prepare(`SELECT COUNT(*) AS n FROM tags`).get() as { n: number }).n

  const totalPrompts = (
    db.prepare(`SELECT COUNT(*) AS n FROM prompt_blocks`).get() as { n: number }
  ).n

  const topCharacters = db
    .prepare(
      `SELECT character_name AS name, COUNT(*) AS chatCount, COALESCE(SUM(message_count),0) AS messageCount
         FROM chats
        WHERE is_trashed = 0 AND character_name IS NOT NULL AND character_name != ''
        GROUP BY character_name
        ORDER BY chatCount DESC, messageCount DESC
        LIMIT 5`
    )
    .all() as { name: string; chatCount: number; messageCount: number }[]

  const monthRows = db
    .prepare(
      `SELECT strftime('%Y-%m', imported_at) AS month, COUNT(*) AS count
         FROM chats
        WHERE is_trashed = 0
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12`
    )
    .all() as { month: string; count: number }[]
  const importsByMonth = [...monthRows].reverse() // chronological, oldest first

  return {
    totalChats,
    totalMessages,
    totalAttachments,
    totalFolders,
    totalTags,
    totalPrompts,
    trashedCount,
    topCharacters,
    importsByMonth
  }
}

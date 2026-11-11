import type Database from 'better-sqlite3'
import type { Tag } from '@shared/types'

export function listTags(db: Database.Database): Tag[] {
  return db.prepare(`SELECT * FROM tags ORDER BY name ASC`).all() as Tag[]
}

export function createTag(
  db: Database.Database,
  name: string,
  color: string | null
): Tag {
  const trimmed = name.trim() || 'Tag'
  const result = db
    .prepare(`INSERT INTO tags (name, color) VALUES (?, ?)`)
    .run(trimmed, color)
  return db.prepare(`SELECT * FROM tags WHERE id = ?`).get(result.lastInsertRowid) as Tag
}

export function renameTag(db: Database.Database, id: number, name: string): Tag {
  db.prepare(`UPDATE tags SET name = ? WHERE id = ?`).run(name.trim() || 'Tag', id)
  return db.prepare(`SELECT * FROM tags WHERE id = ?`).get(id) as Tag
}

export function setTagColor(db: Database.Database, id: number, color: string | null): Tag {
  db.prepare(`UPDATE tags SET color = ? WHERE id = ?`).run(color, id)
  return db.prepare(`SELECT * FROM tags WHERE id = ?`).get(id) as Tag
}

export function deleteTag(db: Database.Database, id: number): void {
  db.prepare(`DELETE FROM tags WHERE id = ?`).run(id)
}

export function assignTag(db: Database.Database, chatId: number, tagId: number): void {
  db.prepare(
    `INSERT OR IGNORE INTO chat_tags (chat_id, tag_id) VALUES (?, ?)`
  ).run(chatId, tagId)
}

export function unassignTag(db: Database.Database, chatId: number, tagId: number): void {
  db.prepare(`DELETE FROM chat_tags WHERE chat_id = ? AND tag_id = ?`).run(chatId, tagId)
}

export function listTagsForChat(db: Database.Database, chatId: number): Tag[] {
  return db
    .prepare(
      `SELECT t.* FROM tags t
         JOIN chat_tags ct ON ct.tag_id = t.id
        WHERE ct.chat_id = ?
        ORDER BY t.name ASC`
    )
    .all(chatId) as Tag[]
}

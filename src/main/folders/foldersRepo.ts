import type Database from 'better-sqlite3'
import type {
  CreateFolderInput,
  Folder,
  MoveFolderInput,
  RenameFolderInput,
  ReorderFoldersInput,
  SetFolderColorInput,
  SetFolderIconInput
} from '@shared/types'

/** Every folder plus a computed chatCount (direct, non-trashed chats),
 *  ordered by position within each parent. */
export function listFolders(db: Database.Database): Folder[] {
  return db
    .prepare(
      `SELECT f.*,
              (SELECT COUNT(*) FROM chats c
                 WHERE c.folder_id = f.id AND c.is_trashed = 0) AS chatCount
         FROM folders f
        WHERE f.is_trashed = 0
        ORDER BY f.position ASC`
    )
    .all() as Folder[]
}

function nextPosition(db: Database.Database, parentId: number | null): number {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM folders
         WHERE (parent_id IS ? OR parent_id = ?) AND is_trashed = 0`
    )
    .get(parentId, parentId) as { next: number }
  return row.next
}

export function createFolder(db: Database.Database, input: CreateFolderInput): Folder {
  const position = nextPosition(db, input.parentId)
  const result = db
    .prepare(`INSERT INTO folders (parent_id, name, position) VALUES (?, ?, ?)`)
    .run(input.parentId, input.name.trim() || 'Untitled folder', position)
  return db.prepare(`SELECT * FROM folders WHERE id = ?`).get(result.lastInsertRowid) as Folder
}

export function renameFolder(db: Database.Database, input: RenameFolderInput): Folder {
  db.prepare(`UPDATE folders SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(
    input.name.trim() || 'Untitled folder',
    input.id
  )
  return db.prepare(`SELECT * FROM folders WHERE id = ?`).get(input.id) as Folder
}

export function setFolderColor(db: Database.Database, input: SetFolderColorInput): Folder {
  db.prepare(`UPDATE folders SET color = ?, updated_at = datetime('now') WHERE id = ?`).run(
    input.color,
    input.id
  )
  return db.prepare(`SELECT * FROM folders WHERE id = ?`).get(input.id) as Folder
}

export function setFolderIcon(db: Database.Database, input: SetFolderIconInput): Folder {
  db.prepare(`UPDATE folders SET icon = ?, updated_at = datetime('now') WHERE id = ?`).run(
    input.icon,
    input.id
  )
  return db.prepare(`SELECT * FROM folders WHERE id = ?`).get(input.id) as Folder
}

/** Renumbers every sibling under `parentId` to match `orderedIds`, 0..n-1. */
export function reorderFolders(db: Database.Database, input: ReorderFoldersInput): void {
  const update = db.prepare(
    `UPDATE folders SET position = ?, updated_at = datetime('now') WHERE id = ? AND parent_id IS ?`
  )
  const run = db.transaction(() => {
    input.orderedIds.forEach((id, index) => {
      update.run(index, id, input.parentId)
    })
  })
  run()
}

function wouldCreateCycle(db: Database.Database, id: number, newParentId: number | null): boolean {
  if (newParentId === null) return false
  if (newParentId === id) return true
  let current: number | null = newParentId
  const seen = new Set<number>()
  while (current !== null) {
    if (current === id) return true
    if (seen.has(current)) break // corrupt data guard
    seen.add(current)
    const row = db.prepare(`SELECT parent_id FROM folders WHERE id = ?`).get(current) as
      | { parent_id: number | null }
      | undefined
    current = row?.parent_id ?? null
  }
  return false
}

/** Reparents a folder and renumbers both the old and new sibling groups. */
export function moveFolder(db: Database.Database, input: MoveFolderInput): void {
  if (wouldCreateCycle(db, input.id, input.newParentId)) {
    throw new Error('Cannot move a folder into itself or one of its own subfolders')
  }

  const run = db.transaction(() => {
    const current = db.prepare(`SELECT parent_id FROM folders WHERE id = ?`).get(input.id) as
      | { parent_id: number | null }
      | undefined
    if (!current) throw new Error(`Folder ${input.id} not found`)

    db.prepare(`UPDATE folders SET parent_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
      input.newParentId,
      input.id
    )

    // Renumber the destination siblings with the moved folder inserted at
    // newPosition (clamped).
    const destSiblings = db
      .prepare(`SELECT id FROM folders WHERE parent_id IS ? AND id != ? ORDER BY position ASC`)
      .all(input.newParentId, input.id) as { id: number }[]
    const destIds = destSiblings.map((r) => r.id)
    const insertAt = Math.max(0, Math.min(input.newPosition, destIds.length))
    destIds.splice(insertAt, 0, input.id)
    reorderFolders(db, { parentId: input.newParentId, orderedIds: destIds })

    // Close the gap left in the old parent, if it changed.
    if (current.parent_id !== input.newParentId) {
      const oldSiblings = db
        .prepare(`SELECT id FROM folders WHERE parent_id IS ? ORDER BY position ASC`)
        .all(current.parent_id) as { id: number }[]
      reorderFolders(db, {
        parentId: current.parent_id,
        orderedIds: oldSiblings.map((r) => r.id)
      })
    }
  })
  run()
}

/** IDs of `id` plus every descendant folder (self included), via a
 *  recursive CTE — used to cascade soft-delete. */
function descendantFolderIds(db: Database.Database, id: number): number[] {
  const rows = db
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM folders WHERE id = ?
         UNION ALL
         SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
       )
       SELECT id FROM descendants`
    )
    .all(id) as { id: number }[]
  return rows.map((r) => r.id)
}

/** Soft-deletes a folder, all its descendant folders, and every chat
 *  directly inside any of them (§6: folder delete cascades to contents). */
export function deleteFolder(db: Database.Database, id: number): void {
  const run = db.transaction(() => {
    const ids = descendantFolderIds(db, id)
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    db.prepare(
      `UPDATE folders SET is_trashed = 1, trashed_at = datetime('now') WHERE id IN (${placeholders})`
    ).run(...ids)
    db.prepare(
      `UPDATE chats SET is_trashed = 1, trashed_at = datetime('now')
         WHERE folder_id IN (${placeholders}) AND is_trashed = 0`
    ).run(...ids)
  })
  run()
}

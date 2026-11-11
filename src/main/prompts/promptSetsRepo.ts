import type Database from 'better-sqlite3'
import type {
  CreatePromptBlockInput,
  CreatePromptSetInput,
  PromptBlock,
  PromptSet,
  RenamePromptSetInput,
  ReorderPromptBlocksInput,
  SetPromptBlockEnabledInput,
  UpdatePromptBlockInput
} from '@shared/types'

// ---- Prompt sets ----

export function listPromptSets(db: Database.Database): PromptSet[] {
  return db.prepare(`SELECT * FROM prompt_sets ORDER BY created_at ASC`).all() as PromptSet[]
}

export function createPromptSet(db: Database.Database, input: CreatePromptSetInput): PromptSet {
  const result = db
    .prepare(`INSERT INTO prompt_sets (name) VALUES (?)`)
    .run(input.name.trim() || 'New Prompt Set')
  return db.prepare(`SELECT * FROM prompt_sets WHERE id = ?`).get(result.lastInsertRowid) as PromptSet
}

export function renamePromptSet(db: Database.Database, input: RenamePromptSetInput): PromptSet {
  db.prepare(`UPDATE prompt_sets SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(
    input.name.trim() || 'New Prompt Set',
    input.id
  )
  return db.prepare(`SELECT * FROM prompt_sets WHERE id = ?`).get(input.id) as PromptSet
}

export function deletePromptSet(db: Database.Database, id: number): void {
  db.prepare(`DELETE FROM prompt_sets WHERE id = ?`).run(id) // cascades to prompt_blocks
}

// ---- Prompt blocks ----

export function listPromptBlocks(db: Database.Database, setId: number): PromptBlock[] {
  return db
    .prepare(`SELECT * FROM prompt_blocks WHERE set_id = ? ORDER BY position ASC`)
    .all(setId) as PromptBlock[]
}

export function createPromptBlock(db: Database.Database, input: CreatePromptBlockInput): PromptBlock {
  const nextPosition = (
    db
      .prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM prompt_blocks WHERE set_id = ?`)
      .get(input.setId) as { next: number }
  ).next

  const result = db
    .prepare(
      `INSERT INTO prompt_blocks (set_id, name, role, content, position)
       VALUES (@set_id, @name, @role, @content, @position)`
    )
    .run({
      set_id: input.setId,
      name: input.name.trim() || 'New Block',
      role: input.role,
      content: input.content,
      position: nextPosition
    })
  return db.prepare(`SELECT * FROM prompt_blocks WHERE id = ?`).get(result.lastInsertRowid) as PromptBlock
}

export function updatePromptBlock(db: Database.Database, input: UpdatePromptBlockInput): PromptBlock {
  db.prepare(
    `UPDATE prompt_blocks SET name = @name, role = @role, content = @content,
       updated_at = datetime('now') WHERE id = @id`
  ).run({
    id: input.id,
    name: input.name.trim() || 'New Block',
    role: input.role,
    content: input.content
  })
  return db.prepare(`SELECT * FROM prompt_blocks WHERE id = ?`).get(input.id) as PromptBlock
}

export function deletePromptBlock(db: Database.Database, id: number): void {
  db.prepare(`DELETE FROM prompt_blocks WHERE id = ?`).run(id)
}

export function setPromptBlockEnabled(
  db: Database.Database,
  input: SetPromptBlockEnabledInput
): PromptBlock {
  db.prepare(`UPDATE prompt_blocks SET enabled = ?, updated_at = datetime('now') WHERE id = ?`).run(
    input.enabled ? 1 : 0,
    input.id
  )
  return db.prepare(`SELECT * FROM prompt_blocks WHERE id = ?`).get(input.id) as PromptBlock
}

/** Renumbers every block in a set to match orderedIds, 0..n-1 (drag reorder). */
export function reorderPromptBlocks(db: Database.Database, input: ReorderPromptBlocksInput): void {
  const update = db.prepare(
    `UPDATE prompt_blocks SET position = ?, updated_at = datetime('now') WHERE id = ? AND set_id = ?`
  )
  const run = db.transaction(() => {
    input.orderedIds.forEach((id, index) => update.run(index, id, input.setId))
  })
  run()
}

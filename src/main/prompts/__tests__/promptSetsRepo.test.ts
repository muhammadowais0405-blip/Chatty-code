import { beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { makeTestDb } from '../../folders/__tests__/testDb'
import {
  createPromptBlock,
  createPromptSet,
  deletePromptBlock,
  deletePromptSet,
  listPromptBlocks,
  listPromptSets,
  renamePromptSet,
  reorderPromptBlocks,
  setPromptBlockEnabled,
  updatePromptBlock
} from '../promptSetsRepo'

let db: Database.Database

beforeEach(() => {
  db = makeTestDb()
})

describe('prompt sets', () => {
  it('creates and lists sets', () => {
    const set = createPromptSet(db, { name: 'NemoEngine 7.4' })
    expect(listPromptSets(db)).toEqual([set])
  })

  it('falls back to a default name when blank', () => {
    const set = createPromptSet(db, { name: '   ' })
    expect(set.name).toBe('New Prompt Set')
  })

  it('renames a set', () => {
    const set = createPromptSet(db, { name: 'Old' })
    const renamed = renamePromptSet(db, { id: set.id, name: 'New' })
    expect(renamed.name).toBe('New')
  })

  it('deletes a set and cascades to its blocks', () => {
    const set = createPromptSet(db, { name: 'ToDelete' })
    createPromptBlock(db, { setId: set.id, name: 'Block', role: 'system', content: 'x' })
    deletePromptSet(db, set.id)
    expect(listPromptSets(db)).toHaveLength(0)
    expect(listPromptBlocks(db, set.id)).toHaveLength(0)
  })
})

describe('prompt blocks', () => {
  it('creates blocks with increasing position within a set', () => {
    const set = createPromptSet(db, { name: 'Set' })
    const a = createPromptBlock(db, { setId: set.id, name: 'A', role: 'system', content: '' })
    const b = createPromptBlock(db, { setId: set.id, name: 'B', role: 'user', content: '' })
    expect(a.position).toBe(0)
    expect(b.position).toBe(1)
  })

  it('tracks position independently per set', () => {
    const set1 = createPromptSet(db, { name: 'Set1' })
    const set2 = createPromptSet(db, { name: 'Set2' })
    createPromptBlock(db, { setId: set1.id, name: 'A', role: 'system', content: '' })
    const b = createPromptBlock(db, { setId: set2.id, name: 'B', role: 'system', content: '' })
    expect(b.position).toBe(0)
  })

  it('defaults enabled to 1 on creation', () => {
    const set = createPromptSet(db, { name: 'Set' })
    const block = createPromptBlock(db, { setId: set.id, name: 'A', role: 'system', content: '' })
    expect(block.enabled).toBe(1)
  })

  it('updates name/role/content', () => {
    const set = createPromptSet(db, { name: 'Set' })
    const block = createPromptBlock(db, { setId: set.id, name: 'Old', role: 'system', content: 'old' })
    const updated = updatePromptBlock(db, { id: block.id, name: 'New', role: 'user', content: 'new' })
    expect(updated).toMatchObject({ name: 'New', role: 'user', content: 'new' })
  })

  it('toggles enabled', () => {
    const set = createPromptSet(db, { name: 'Set' })
    const block = createPromptBlock(db, { setId: set.id, name: 'A', role: 'system', content: '' })
    const disabled = setPromptBlockEnabled(db, { id: block.id, enabled: false })
    expect(disabled.enabled).toBe(0)
    const reenabled = setPromptBlockEnabled(db, { id: block.id, enabled: true })
    expect(reenabled.enabled).toBe(1)
  })

  it('deletes a block', () => {
    const set = createPromptSet(db, { name: 'Set' })
    const block = createPromptBlock(db, { setId: set.id, name: 'A', role: 'system', content: '' })
    deletePromptBlock(db, block.id)
    expect(listPromptBlocks(db, set.id)).toHaveLength(0)
  })

  it('reorders blocks within a set', () => {
    const set = createPromptSet(db, { name: 'Set' })
    const a = createPromptBlock(db, { setId: set.id, name: 'A', role: 'system', content: '' })
    const b = createPromptBlock(db, { setId: set.id, name: 'B', role: 'system', content: '' })
    const c = createPromptBlock(db, { setId: set.id, name: 'C', role: 'system', content: '' })

    reorderPromptBlocks(db, { setId: set.id, orderedIds: [c.id, a.id, b.id] })

    const blocks = listPromptBlocks(db, set.id)
    expect(blocks.map((x) => x.name)).toEqual(['C', 'A', 'B'])
  })
})

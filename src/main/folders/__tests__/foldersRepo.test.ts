import { beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { makeTestDb } from './testDb'
import {
  createFolder,
  deleteFolder,
  listFolders,
  moveFolder,
  renameFolder,
  reorderFolders,
  setFolderColor,
  setFolderIcon
} from '../foldersRepo'

let db: Database.Database

beforeEach(() => {
  db = makeTestDb()
})

describe('createFolder', () => {
  it('creates a root folder at the next position', () => {
    const a = createFolder(db, { parentId: null, name: 'Alpha' })
    const b = createFolder(db, { parentId: null, name: 'Beta' })
    expect(a.position).toBe(0)
    expect(b.position).toBe(1)
  })

  it('falls back to a default name when blank', () => {
    const f = createFolder(db, { parentId: null, name: '   ' })
    expect(f.name).toBe('Untitled folder')
  })

  it('tracks subfolder positions independently per parent', () => {
    const parent = createFolder(db, { parentId: null, name: 'Parent' })
    const child1 = createFolder(db, { parentId: parent.id, name: 'Child 1' })
    const child2 = createFolder(db, { parentId: parent.id, name: 'Child 2' })
    expect(child1.position).toBe(0)
    expect(child2.position).toBe(1)
  })
})

describe('renameFolder / setFolderColor / setFolderIcon', () => {
  it('updates name, color, and icon independently', () => {
    const f = createFolder(db, { parentId: null, name: 'Original' })
    const renamed = renameFolder(db, { id: f.id, name: 'Renamed' })
    expect(renamed.name).toBe('Renamed')

    const colored = setFolderColor(db, { id: f.id, color: '#ff0000' })
    expect(colored.color).toBe('#ff0000')

    const iconed = setFolderIcon(db, { id: f.id, icon: 'folder-heart' })
    expect(iconed.icon).toBe('folder-heart')
  })
})

describe('reorderFolders', () => {
  it('renumbers siblings to match the given order', () => {
    const a = createFolder(db, { parentId: null, name: 'A' })
    const b = createFolder(db, { parentId: null, name: 'B' })
    const c = createFolder(db, { parentId: null, name: 'C' })

    reorderFolders(db, { parentId: null, orderedIds: [c.id, a.id, b.id] })

    const folders = listFolders(db)
    const byId = Object.fromEntries(folders.map((f) => [f.id, f.position]))
    expect(byId[c.id]).toBe(0)
    expect(byId[a.id]).toBe(1)
    expect(byId[b.id]).toBe(2)
  })
})

describe('moveFolder', () => {
  it('reparents a folder and closes the gap in the old parent', () => {
    const root1 = createFolder(db, { parentId: null, name: 'Root1' })
    const root2 = createFolder(db, { parentId: null, name: 'Root2' })
    const child = createFolder(db, { parentId: root1.id, name: 'Child' })
    const sibling = createFolder(db, { parentId: root1.id, name: 'Sibling' })

    moveFolder(db, { id: child.id, newParentId: root2.id, newPosition: 0 })

    const folders = listFolders(db)
    const moved = folders.find((f) => f.id === child.id)!
    expect(moved.parent_id).toBe(root2.id)
    expect(moved.position).toBe(0)

    const remainingSibling = folders.find((f) => f.id === sibling.id)!
    expect(remainingSibling.position).toBe(0) // gap closed
  })

  it('refuses to move a folder into its own descendant (cycle guard)', () => {
    const parent = createFolder(db, { parentId: null, name: 'Parent' })
    const child = createFolder(db, { parentId: parent.id, name: 'Child' })
    expect(() => moveFolder(db, { id: parent.id, newParentId: child.id, newPosition: 0 })).toThrow()
  })

  it('refuses to move a folder into itself', () => {
    const f = createFolder(db, { parentId: null, name: 'F' })
    expect(() => moveFolder(db, { id: f.id, newParentId: f.id, newPosition: 0 })).toThrow()
  })
})

describe('deleteFolder (cascade soft-delete)', () => {
  it('soft-deletes the folder, its descendants, and chats inside any of them', () => {
    const parent = createFolder(db, { parentId: null, name: 'Parent' })
    const child = createFolder(db, { parentId: parent.id, name: 'Child' })

    db.prepare(
      `INSERT INTO chats (folder_id, title, source_format) VALUES (?, 'Chat in parent', 'flat_v1')`
    ).run(parent.id)
    db.prepare(
      `INSERT INTO chats (folder_id, title, source_format) VALUES (?, 'Chat in child', 'flat_v1')`
    ).run(child.id)

    deleteFolder(db, parent.id)

    const folders = listFolders(db)
    expect(folders.find((f) => f.id === parent.id)).toBeUndefined()
    expect(folders.find((f) => f.id === child.id)).toBeUndefined()

    const trashedChats = db
      .prepare(`SELECT is_trashed FROM chats ORDER BY id`)
      .all() as { is_trashed: number }[]
    expect(trashedChats.every((c) => c.is_trashed === 1)).toBe(true)
  })

  it('leaves sibling folders and their chats untouched', () => {
    const toDelete = createFolder(db, { parentId: null, name: 'ToDelete' })
    const untouched = createFolder(db, { parentId: null, name: 'Untouched' })

    deleteFolder(db, toDelete.id)

    const folders = listFolders(db)
    expect(folders.find((f) => f.id === untouched.id)).toBeDefined()
  })
})

describe('listFolders chatCount', () => {
  it('counts only direct, non-trashed chats', () => {
    const folder = createFolder(db, { parentId: null, name: 'F' })
    db.prepare(`INSERT INTO chats (folder_id, title, source_format) VALUES (?, 'A', 'flat_v1')`).run(
      folder.id
    )
    db.prepare(
      `INSERT INTO chats (folder_id, title, source_format, is_trashed) VALUES (?, 'B', 'flat_v1', 1)`
    ).run(folder.id)

    const [result] = listFolders(db)
    expect(result.chatCount).toBe(1)
  })
})

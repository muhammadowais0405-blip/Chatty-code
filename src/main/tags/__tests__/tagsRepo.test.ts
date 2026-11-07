import { beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { makeTestDb } from '../../folders/__tests__/testDb'
import {
  assignTag,
  createTag,
  deleteTag,
  listTags,
  listTagsForChat,
  renameTag,
  setTagColor,
  unassignTag
} from '../tagsRepo'
import { listChatsByTag } from '../../chats/chatsRepo'

let db: Database.Database

function insertChat(db: Database.Database, title: string): number {
  return Number(
    db.prepare(`INSERT INTO chats (title, source_format) VALUES (?, 'flat_v1')`).run(title)
      .lastInsertRowid
  )
}

beforeEach(() => {
  db = makeTestDb()
})

describe('createTag / listTags', () => {
  it('creates a tag and returns it from listTags', () => {
    const tag = createTag(db, 'Favourites', '#8b5cf6')
    const tags = listTags(db)
    expect(tags).toHaveLength(1)
    expect(tags[0]).toMatchObject({ id: tag.id, name: 'Favourites', color: '#8b5cf6' })
  })

  it('falls back to "Tag" for a blank name', () => {
    const tag = createTag(db, '   ', null)
    expect(tag.name).toBe('Tag')
  })

  it('sorts tags alphabetically', () => {
    createTag(db, 'Zeta', null)
    createTag(db, 'Alpha', null)
    const names = listTags(db).map((t) => t.name)
    expect(names).toEqual(['Alpha', 'Zeta'])
  })
})

describe('renameTag / setTagColor / deleteTag', () => {
  it('renames and recolors a tag', () => {
    const tag = createTag(db, 'Old', null)
    renameTag(db, tag.id, 'New')
    setTagColor(db, tag.id, '#ff0000')
    const [updated] = listTags(db)
    expect(updated.name).toBe('New')
    expect(updated.color).toBe('#ff0000')
  })

  it('deletes a tag and removes it from chat_tags', () => {
    const chatId = insertChat(db, 'Test')
    const tag = createTag(db, 'ToDelete', null)
    assignTag(db, chatId, tag.id)
    deleteTag(db, tag.id)
    expect(listTags(db)).toHaveLength(0)
    expect(listTagsForChat(db, chatId)).toHaveLength(0)
  })
})

describe('assignTag / unassignTag / listTagsForChat', () => {
  it('assigns a tag to a chat and lists it back', () => {
    const chatId = insertChat(db, 'Chat')
    const tag = createTag(db, 'Sci-Fi', '#22b8cf')
    assignTag(db, chatId, tag.id)
    const result = listTagsForChat(db, chatId)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Sci-Fi')
  })

  it('assign is idempotent (INSERT OR IGNORE)', () => {
    const chatId = insertChat(db, 'Chat')
    const tag = createTag(db, 'Dup', null)
    assignTag(db, chatId, tag.id)
    assignTag(db, chatId, tag.id) // should not throw
    expect(listTagsForChat(db, chatId)).toHaveLength(1)
  })

  it('unassigns a tag', () => {
    const chatId = insertChat(db, 'Chat')
    const tag = createTag(db, 'ToRemove', null)
    assignTag(db, chatId, tag.id)
    unassignTag(db, chatId, tag.id)
    expect(listTagsForChat(db, chatId)).toHaveLength(0)
  })
})

describe('listChatsByTag', () => {
  it('returns only chats with the given tag, excluding trashed', () => {
    const chatId1 = insertChat(db, 'Tagged')
    const chatId2 = insertChat(db, 'Also tagged')
    insertChat(db, 'Untagged')
    db.prepare(`UPDATE chats SET is_trashed = 1 WHERE id = ?`).run(chatId2)

    const tag = createTag(db, 'Special', null)
    assignTag(db, chatId1, tag.id)
    assignTag(db, chatId2, tag.id) // trashed — should not appear

    const results = listChatsByTag(db, tag.id)
    expect(results.map((c) => c.id)).toEqual([chatId1])
  })
})

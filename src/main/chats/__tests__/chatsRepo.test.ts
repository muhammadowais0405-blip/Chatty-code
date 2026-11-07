import { beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { makeTestDb } from '../../folders/__tests__/testDb'
import { createFolder, deleteFolder } from '../../folders/foldersRepo'
import {
  deleteChatRow,
  findDuplicateChat,
  getChatDetail,
  listChatsByFolder,
  moveChat,
  renameChat,
  restoreChat,
  searchChats,
  trashChat
} from '../chatsRepo'

let db: Database.Database

function insertChat(
  db: Database.Database,
  opts: { folderId?: number | null; title: string; characterName?: string; trashed?: boolean }
): number {
  const result = db
    .prepare(
      `INSERT INTO chats (folder_id, title, source_format, character_name, is_trashed)
       VALUES (?, ?, 'flat_v1', ?, ?)`
    )
    .run(opts.folderId ?? null, opts.title, opts.characterName ?? null, opts.trashed ? 1 : 0)
  return Number(result.lastInsertRowid)
}

function insertMessage(
  db: Database.Database,
  chatId: number,
  seq: number,
  text: string
): number {
  const result = db
    .prepare(
      `INSERT INTO messages (chat_id, seq, sender_name, is_user, text, raw_json)
       VALUES (?, ?, 'Someone', 0, ?, '{}')`
    )
    .run(chatId, seq, text)
  return Number(result.lastInsertRowid)
}

function insertAttachment(
  db: Database.Database,
  messageId: number,
  opts: { mimeType?: string; missing?: boolean }
): number {
  const result = db
    .prepare(
      `INSERT INTO attachments (message_id, stored_path, mime_type, missing)
       VALUES (?, 'x.png', ?, ?)`
    )
    .run(messageId, opts.mimeType ?? 'image/png', opts.missing ? 1 : 0)
  return Number(result.lastInsertRowid)
}

beforeEach(() => {
  db = makeTestDb()
})

describe('listChatsByFolder', () => {
  it('"all" returns non-trashed chats only, newest first', () => {
    insertChat(db, { title: 'Older' })
    db.prepare(`UPDATE chats SET imported_at = '2026-01-01 00:00:00' WHERE title = 'Older'`).run()
    insertChat(db, { title: 'Newer' })
    db.prepare(`UPDATE chats SET imported_at = '2026-02-01 00:00:00' WHERE title = 'Newer'`).run()
    insertChat(db, { title: 'Trashed', trashed: true })

    const result = listChatsByFolder(db, 'all')
    expect(result.map((c) => c.title)).toEqual(['Newer', 'Older'])
    // tagSummary is null when no tags are assigned
    expect(result[0].tagSummary).toBeNull()
  })

  it('"trash" returns only trashed chats', () => {
    insertChat(db, { title: 'Kept' })
    insertChat(db, { title: 'Trashed', trashed: true })

    const result = listChatsByFolder(db, 'trash')
    expect(result.map((c) => c.title)).toEqual(['Trashed'])
  })

  it('a folder id returns only chats directly in that folder', () => {
    const folder = createFolder(db, { parentId: null, name: 'F' })
    insertChat(db, { folderId: folder.id, title: 'In folder' })
    insertChat(db, { folderId: null, title: 'Root chat' })

    const result = listChatsByFolder(db, folder.id)
    expect(result.map((c) => c.title)).toEqual(['In folder'])
  })

  it('resolves thumbnailAttachmentId to the first non-missing image attachment', () => {
    const chatId = insertChat(db, { title: 'With images' })
    const msg1 = insertMessage(db, chatId, 0, 'first')
    const msg2 = insertMessage(db, chatId, 1, 'second')
    insertAttachment(db, msg1, { mimeType: 'image/png', missing: true }) // skipped: missing
    const goodId = insertAttachment(db, msg2, { mimeType: 'image/webp' })

    const [result] = listChatsByFolder(db, 'all')
    expect(result.thumbnailAttachmentId).toBe(goodId)
  })

  it('leaves thumbnailAttachmentId null when there are no image attachments', () => {
    const chatId = insertChat(db, { title: 'No images' })
    insertMessage(db, chatId, 0, 'text only')

    const [result] = listChatsByFolder(db, 'all')
    expect(result.thumbnailAttachmentId).toBeNull()
  })
})

describe('getChatDetail', () => {
  it('returns chat, ordered messages, and attachments joined through messages', () => {
    const chatId = insertChat(db, { title: 'Detail test' })
    const msg1 = insertMessage(db, chatId, 1, 'second message') // out of order on purpose
    insertMessage(db, chatId, 0, 'first message')
    insertAttachment(db, msg1, {})

    const detail = getChatDetail(db, chatId)
    expect(detail.messages.map((m) => m.seq)).toEqual([0, 1])
    expect(detail.attachments).toHaveLength(1)
  })

  it('throws for an unknown chat id', () => {
    expect(() => getChatDetail(db, 999)).toThrow()
  })
})

describe('moveChat / renameChat', () => {
  it('moves a chat to a new folder (or back to root with null)', () => {
    const folder = createFolder(db, { parentId: null, name: 'F' })
    const chatId = insertChat(db, { title: 'Movable' })

    moveChat(db, { chatId, targetFolderId: folder.id })
    expect(getChatDetail(db, chatId).chat.folder_id).toBe(folder.id)

    moveChat(db, { chatId, targetFolderId: null })
    expect(getChatDetail(db, chatId).chat.folder_id).toBeNull()
  })

  it('renames a chat, falling back to a default for a blank title', () => {
    const chatId = insertChat(db, { title: 'Original' })
    renameChat(db, { chatId, title: 'New title' })
    expect(getChatDetail(db, chatId).chat.title).toBe('New title')

    renameChat(db, { chatId, title: '   ' })
    expect(getChatDetail(db, chatId).chat.title).toBe('Untitled chat')
  })
})

describe('findDuplicateChat', () => {
  it('finds a chat with matching title + character_name + message_count', () => {
    insertChat(db, { title: 'Rooftop date', characterName: 'Aria' })
    db.prepare(`UPDATE chats SET message_count = 12 WHERE title = 'Rooftop date'`).run()

    const found = findDuplicateChat(db, 'Rooftop date', 'Aria', 12)
    expect(found).not.toBeNull()
    expect(found?.title).toBe('Rooftop date')
  })

  it('does not match when message_count differs', () => {
    insertChat(db, { title: 'Rooftop date', characterName: 'Aria' })
    db.prepare(`UPDATE chats SET message_count = 12 WHERE title = 'Rooftop date'`).run()

    expect(findDuplicateChat(db, 'Rooftop date', 'Aria', 13)).toBeNull()
  })

  it('does not match trashed chats', () => {
    insertChat(db, { title: 'Trashed one', characterName: 'Kai', trashed: true })
    db.prepare(`UPDATE chats SET message_count = 5 WHERE title = 'Trashed one'`).run()

    expect(findDuplicateChat(db, 'Trashed one', 'Kai', 5)).toBeNull()
  })

  it('handles null character_name correctly (IS comparison)', () => {
    insertChat(db, { title: 'No character' })
    db.prepare(`UPDATE chats SET message_count = 3 WHERE title = 'No character'`).run()

    expect(findDuplicateChat(db, 'No character', null, 3)).not.toBeNull()
  })
})

describe('searchChats', () => {
  it('matches on title, character_name, or message text', () => {
    const chatId1 = insertChat(db, { title: 'Rooftop date', characterName: 'Aria' })
    insertMessage(db, chatId1, 0, 'nice view up here')
    insertChat(db, { title: 'Unrelated chat', characterName: 'Kai' })

    expect(searchChats(db, 'rooftop').map((c) => c.id)).toEqual([chatId1])
    expect(searchChats(db, 'aria').map((c) => c.id)).toEqual([chatId1])
    expect(searchChats(db, 'view up here').map((c) => c.id)).toEqual([chatId1])
    expect(searchChats(db, 'nonexistent')).toEqual([])
  })

  it('excludes trashed chats', () => {
    insertChat(db, { title: 'Trashed match', trashed: true })
    expect(searchChats(db, 'trashed')).toEqual([])
  })
})

describe('trashChat / restoreChat / deleteChatRow', () => {
  it('trashChat moves a chat into the trash view', () => {
    const chatId = insertChat(db, { title: 'To trash' })
    trashChat(db, chatId)

    expect(listChatsByFolder(db, 'all')).toEqual([])
    const [trashed] = listChatsByFolder(db, 'trash')
    expect(trashed.id).toBe(chatId)
    expect(getChatDetail(db, chatId).chat.trashed_at).not.toBeNull()
  })

  it('restoreChat brings a chat back to its original folder', () => {
    const folder = createFolder(db, { parentId: null, name: 'Keeper' })
    const chatId = insertChat(db, { folderId: folder.id, title: 'Restorable' })
    trashChat(db, chatId)

    restoreChat(db, chatId)

    const detail = getChatDetail(db, chatId)
    expect(detail.chat.is_trashed).toBe(0)
    expect(detail.chat.trashed_at).toBeNull()
    expect(detail.chat.folder_id).toBe(folder.id)
  })

  it('restoreChat falls back to root if the original folder was deleted', () => {
    const folder = createFolder(db, { parentId: null, name: 'Gone soon' })
    const chatId = insertChat(db, { folderId: folder.id, title: 'Orphaned' })
    trashChat(db, chatId)
    deleteFolder(db, folder.id) // soft-deletes the folder itself

    restoreChat(db, chatId)

    expect(getChatDetail(db, chatId).chat.folder_id).toBeNull()
  })

  it('restoreChat falls back to root if the folder_id points at a hard-deleted folder (FK ON DELETE SET NULL already nulls this)', () => {
    const folder = createFolder(db, { parentId: null, name: 'Hard deleted' })
    const chatId = insertChat(db, { folderId: folder.id, title: 'Orphaned' })
    trashChat(db, chatId)
    db.prepare(`DELETE FROM folders WHERE id = ?`).run(folder.id)

    restoreChat(db, chatId)

    expect(getChatDetail(db, chatId).chat.folder_id).toBeNull()
  })

  it('deleteChatRow removes the chat and cascades to messages/attachments', () => {
    const chatId = insertChat(db, { title: 'Doomed' })
    const msgId = insertMessage(db, chatId, 0, 'bye')
    insertAttachment(db, msgId, {})

    deleteChatRow(db, chatId)

    expect(() => getChatDetail(db, chatId)).toThrow()
    const remainingMessages = db.prepare(`SELECT COUNT(*) AS n FROM messages`).get() as {
      n: number
    }
    const remainingAttachments = db.prepare(`SELECT COUNT(*) AS n FROM attachments`).get() as {
      n: number
    }
    expect(remainingMessages.n).toBe(0)
    expect(remainingAttachments.n).toBe(0)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { makeTestDb } from '../../folders/__tests__/testDb'
import { computeLibraryStats } from '../statsRepo'

let db: Database.Database

function insertChat(
  db: Database.Database,
  opts: { title: string; characterName?: string | null; messageCount?: number; trashed?: boolean; importedAt?: string }
): number {
  const r = db
    .prepare(
      `INSERT INTO chats (title, source_format, character_name, message_count, is_trashed)
       VALUES (?, 'flat_v1', ?, ?, ?)`
    )
    .run(opts.title, opts.characterName ?? null, opts.messageCount ?? 0, opts.trashed ? 1 : 0)
  const id = Number(r.lastInsertRowid)
  if (opts.importedAt) {
    db.prepare(`UPDATE chats SET imported_at = ? WHERE id = ?`).run(opts.importedAt, id)
  }
  return id
}

beforeEach(() => {
  db = makeTestDb()
})

describe('computeLibraryStats', () => {
  it('returns zeroed stats for an empty library', () => {
    const stats = computeLibraryStats(db)
    expect(stats.totalChats).toBe(0)
    expect(stats.totalMessages).toBe(0)
    expect(stats.topCharacters).toEqual([])
    expect(stats.importsByMonth).toEqual([])
  })

  it('counts chats and messages, excluding trashed', () => {
    insertChat(db, { title: 'A', messageCount: 10 })
    insertChat(db, { title: 'B', messageCount: 5 })
    insertChat(db, { title: 'Trashed', messageCount: 99, trashed: true })

    const stats = computeLibraryStats(db)
    expect(stats.totalChats).toBe(2)
    expect(stats.totalMessages).toBe(15)
    expect(stats.trashedCount).toBe(1)
  })

  it('ranks top characters by chat count', () => {
    insertChat(db, { title: 'A1', characterName: 'Aria', messageCount: 10 })
    insertChat(db, { title: 'A2', characterName: 'Aria', messageCount: 20 })
    insertChat(db, { title: 'K1', characterName: 'Kai', messageCount: 5 })

    const [top] = computeLibraryStats(db).topCharacters
    expect(top.name).toBe('Aria')
    expect(top.chatCount).toBe(2)
    expect(top.messageCount).toBe(30)
  })

  it('excludes chats with no character_name from topCharacters', () => {
    insertChat(db, { title: 'No char', messageCount: 5 })
    expect(computeLibraryStats(db).topCharacters).toEqual([])
  })

  it('groups imports by month, chronological order', () => {
    insertChat(db, { title: 'Jan', importedAt: '2026-01-15 10:00:00' })
    insertChat(db, { title: 'Jan2', importedAt: '2026-01-20 10:00:00' })
    insertChat(db, { title: 'Feb', importedAt: '2026-02-05 10:00:00' })

    const months = computeLibraryStats(db).importsByMonth
    expect(months).toEqual([
      { month: '2026-01', count: 2 },
      { month: '2026-02', count: 1 }
    ])
  })

  it('counts folders and tags', () => {
    db.prepare(`INSERT INTO folders (name) VALUES ('F1')`).run()
    db.prepare(`INSERT INTO tags (name) VALUES ('T1')`).run()

    const stats = computeLibraryStats(db)
    expect(stats.totalFolders).toBe(1)
    expect(stats.totalTags).toBe(1)
  })
})

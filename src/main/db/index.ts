import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { migrations } from './migrations/index'

let db: Database.Database | null = null

/**
 * Runs each embedded migration, in order, that hasn't already been
 * recorded in `_migrations`. Migration 001 creates the `_migrations`
 * table itself, so the very first run bootstraps cleanly.
 */
function runMigrations(database: Database.Database): void {
  const hasMigrationsTable = database
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'`)
    .get()

  const applied = new Set<string>(
    hasMigrationsTable
      ? (database.prepare(`SELECT name FROM _migrations`).all() as { name: string }[]).map(
          (r) => r.name
        )
      : []
  )

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue
    const runMigration = database.transaction(() => {
      database.exec(migration.sql)
      // 001_init.sql creates _migrations as part of its own script, so by
      // the time we get here the INSERT below always has somewhere to go.
      database.prepare(`INSERT INTO _migrations (name) VALUES (?)`).run(migration.name)
    })
    runMigration()
    console.log(`[db] applied migration ${migration.name}`)
  }
}

export function getDb(): Database.Database {
  if (db) return db

  const userDataDir = app.getPath('userData')
  if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true })

  const dbPath = join(userDataDir, 'library.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)

  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

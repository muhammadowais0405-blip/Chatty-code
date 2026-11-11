import Database from 'better-sqlite3'
import { migrations } from '../../db/migrations/index'

export function makeTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const m of migrations) db.exec(m.sql)
  return db
}

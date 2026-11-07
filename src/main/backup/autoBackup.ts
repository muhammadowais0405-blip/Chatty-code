import type Database from 'better-sqlite3'
import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { exportBackup } from './backupExport'
import { loadSettings, saveSettings } from '../settings'

let timer: ReturnType<typeof setInterval> | null = null

/** Deletes the oldest backup-*.zip files in dir when count exceeds keepCount. */
function pruneOldBackups(dir: string, keepCount: number): void {
  if (keepCount <= 0) return
  try {
    const files = readdirSync(dir)
      .filter((f) => /^backup-.*\.zip$/.test(f))
      .map((f) => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => a.mtime - b.mtime) // oldest first

    const toDelete = files.slice(0, Math.max(0, files.length - keepCount))
    for (const f of toDelete) {
      try {
        unlinkSync(join(dir, f.name))
      } catch {
        /* ignore locked/missing files */
      }
    }
  } catch {
    /* ignore directory read errors */
  }
}

async function runAutoBackup(db: Database.Database): Promise<void> {
  const settings = loadSettings()
  if (!settings.autoBackup.enabled || !settings.defaultBackupFolder) return

  const intervalMs = settings.autoBackup.intervalHours * 3_600_000
  const lastRun = settings.autoBackup.lastRunAt
    ? new Date(settings.autoBackup.lastRunAt).getTime()
    : 0
  if (Date.now() - lastRun < intervalMs) return

  try {
    await exportBackup(db, {
      destPath: settings.defaultBackupFolder,
      scope: 'all',
      includeLinkMode: false
    })
    pruneOldBackups(settings.defaultBackupFolder, settings.autoBackup.keepCount)
    saveSettings({
      ...settings,
      autoBackup: { ...settings.autoBackup, lastRunAt: new Date().toISOString() }
    })
    console.log('[auto-backup] completed')
  } catch (err) {
    console.error('[auto-backup] failed:', err)
  }
}

export function startAutoBackup(db: Database.Database): void {
  stopAutoBackup()
  // Check every 30 minutes; the actual run only fires when the interval has elapsed
  timer = setInterval(() => void runAutoBackup(db), 30 * 60_000)
  // Also attempt immediately on startup (catches missed backups after a reboot)
  void runAutoBackup(db)
}

export function stopAutoBackup(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** Called whenever settings change so the scheduler picks up new config. */
export function restartAutoBackup(db: Database.Database, settings: Settings): void {
  stopAutoBackup()
  if (settings.autoBackup.enabled && settings.defaultBackupFolder) {
    startAutoBackup(db)
  }
}

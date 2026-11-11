Here’s Batch 1 (dead-code cleanup) and Batch 2 (Windows-critical fixes). Each edit gives the file, what to find, and what to replace it with. After each batch, run npm run typecheck && npm test, then commit. I split the batches so a failure points at one small set of changes.

I deliberately left out folders.is_system, migrations 003/004, linkModeDefault and the duplicated UI helpers. They need a schema change or a bigger refactor, so they belong in the 2.0 baseline migration (M2).

Batch 1: dead-code cleanup
1.1 src/renderer/src/components/sidebar/Sidebar.tsx

Replace the import line:

ts
import { FOLDER_COLORS, FOLDER_ICONS, getFolderIcon } from './icons'

with:

ts
import { FOLDER_COLORS, FOLDER_ICONS } from './icons'

Delete the last two lines of the file:

ts
// re-export so other modules can render a folder's icon consistently
export { getFolderIcon }
1.2 Remove the never-emitted 'error' progress phase

src/shared/types.ts: replace the ImportProgress interface with:

ts
export interface ImportProgress {
  phase: 'reading' | 'parsing' | 'attachments' | 'done'
  current: number
  total: number
}

src/renderer/src/components/ImportDialog.tsx: replace PHASE_LABEL with:

ts
const PHASE_LABEL: Record<ImportProgress['phase'], string> = {
  reading: 'Reading export…',
  parsing: 'Detecting format…',
  attachments: 'Importing messages & attachments…',
  done: 'Done'
}
1.3 Remove totalPrompts

src/shared/types.ts: delete this line from LibraryStats:

ts
  totalPrompts: number

src/main/stats/statsRepo.ts: delete this block:

ts
  const totalPrompts = (
    db.prepare(`SELECT COUNT(*) AS n FROM prompt_blocks`).get() as { n: number }
  ).n

and delete this line from the return { ... } object:

ts
    totalPrompts,

src/main/stats/__tests__/statsRepo.test.ts: replace the last test with:

ts
  it('counts folders and tags', () => {
    db.prepare(`INSERT INTO folders (name) VALUES ('F1')`).run()
    db.prepare(`INSERT INTO tags (name) VALUES ('T1')`).run()

    const stats = computeLibraryStats(db)
    expect(stats.totalFolders).toBe(1)
    expect(stats.totalTags).toBe(1)
  })
1.4 src/main/chats/chatsRepo.ts: FTS cleanup and a search fix

In renameChat, delete these two lines. The chats_au trigger already updates the index, and writing to an external-content FTS table by hand can corrupt it:

ts
  // Update FTS index
  db.prepare(`UPDATE chats_fts SET title = ? WHERE rowid = ?`).run(title, input.chatId)

Replace everything from /** Escapes a user search term down to the end of searchChats. That covers fts5Escape, hasFts5, searchChats and the LIKE fallback. Leave trashChat and everything after it. Use this:

ts
/** Turns user input into an FTS5 query: every word becomes a quoted prefix
 *  term ("roof"* matches "rooftop") and all words must match (implicit AND). */
function toFtsQuery(input: string): string | null {
  const words = input.split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  return words.map((w) => `"${w.replace(/"/g, '""')}"*`).join(' ')
}

/** Searches chat titles, character names and message text via FTS5
 *  (migration 002 always creates the tables). */
export function searchChats(db: Database.Database, query: string): ChatSummary[] {
  const term = toFtsQuery(query)
  if (!term) return []
  try {
    return db
      .prepare(
        `SELECT ${SUMMARY_COLS}
           FROM chats c
          WHERE c.is_trashed = 0
            AND (
              c.id IN (SELECT rowid FROM chats_fts WHERE chats_fts MATCH ?)
              OR c.id IN (
                SELECT m.chat_id FROM messages m
                 WHERE m.id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)
              )
            )
          ORDER BY c.imported_at DESC
          LIMIT 200`
      )
      .all(term, term) as ChatSummary[]
  } catch {
    return [] // malformed FTS expression: treat as "no results"
  }
}
1.5 Remove the unused tags:listForChat IPC channel

src/shared/ipc-channels.ts: delete:

ts
  tagsListForChat: 'tags:listForChat',

src/preload/index.ts: in the tags block, replace:

ts
    unassign: (chatId: number, tagId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.tagsUnassign, { chatId, tagId }),
    listForChat: (chatId: number): Promise<Tag[]> =>
      ipcRenderer.invoke(IPC.tagsListForChat, { chatId })
  },

with:

ts
    unassign: (chatId: number, tagId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.tagsUnassign, { chatId, tagId })
  },

src/main/ipc/register.ts:

Delete this handler:
ts
    ipcMain.handle(IPC.tagsListForChat, (_event, { chatId }: { chatId: number }): Tag[] =>
      listTagsForChat(getDb(), chatId)
    )
In the '../tags/tagsRepo' import, delete the listTagsForChat, line.
Delete the duplicate import import { listChatsByTag } from '../chats/chatsRepo' and add listChatsByTag, to the main '../chats/chatsRepo' import list, after deleteChatRow,. It will read deleteChatRow, getChatDetail, listChatsByFolder, listChatsByTag, ....

(listTagsForChat stays in tagsRepo.ts because its tests use it.)

Check: npm run typecheck && npm test. If it’s green, run git commit -am "chore: remove dead code, fix search prefix matching".

Batch 2: Windows-critical fixes
2.1 New file src/main/util/readTextFile.ts

This strips the UTF-8 BOM that Notepad adds.

ts
import { readFileSync } from 'node:fs'

/** Reads a UTF-8 text file and strips a leading BOM (Windows Notepad adds one). */
export function readTextFile(path: string): string {
  const raw = readFileSync(path, 'utf-8')
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
}
2.2 Use it in importChat.ts and backupRestore.ts

src/main/import/importChat.ts

Replace the first import line:
ts
  import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'

with:

ts
  import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
Add import { readTextFile } from '../util/readTextFile' after the sanitizeFilename import.
In readJsonLines, replace const raw = readFileSync(path, 'utf-8') with:
ts
  const raw = readTextFile(path)

src/main/backup/backupRestore.ts

Replace:
ts
  import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'

with:

ts
  import { copyFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs'
Add import { readTextFile } from '../util/readTextFile' after the sanitizeFilename import.
In readJson, replace return JSON.parse(readFileSync(full, 'utf-8')) with:
ts
  return JSON.parse(readTextFile(full))
2.3 Fix the Import/Restore file pickers

On Windows, ['openFile','openDirectory'] shows a folder-only dialog, so .zip and .jsonl files can’t be selected. The fix is a file-only picker for files, and the existing selectFolder for folders.

src/shared/ipc-channels.ts: add after dialogSelectBackupDest:

ts
  dialogSelectBackupFile: 'dialog:selectBackupFile',

(Add a comma after the dialogSelectBackupDest line if needed.)

src/main/ipc/register.ts: replace the whole dialogSelectImportSource handler with:

ts
  ipcMain.handle(IPC.dialogSelectImportSource, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Select a chat export file',
      properties: ['openFile'],
      filters: [
        { name: 'Chat exports (.jsonl, .txt, .zip)', extensions: ['jsonl', 'txt', 'zip'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.dialogSelectBackupFile, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Select a backup file',
      properties: ['openFile'],
      filters: [
        { name: 'Chat Archiver backup (.zip)', extensions: ['zip'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

src/preload/index.ts: in the dialog block, replace:

ts
    selectBackupDest: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialogSelectBackupDest)
  },

with:

ts
    selectBackupDest: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialogSelectBackupDest),
    selectBackupFile: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialogSelectBackupFile)
  },

src/renderer/src/components/BackupDialog.tsx: in RestorePanel.pickSource, replace:

ts
    const p = await window.api.dialog.selectImportSource()

with:

ts
    const p = await window.api.dialog.selectBackupFile()

src/renderer/src/components/ImportDialog.tsx

Add this function after pickSource:
ts
  async function pickSourceFolder(): Promise<void> {
    const path = await window.api.dialog.selectFolder(
      'Select the folder that contains the chat export'
    )
    if (path) setSourcePath(path)
  }
In the “Source” field, replace this button (the one with onClick={pickSource}):
tsx
            <button className="pill-button" onClick={pickSource} disabled={submitting}>
              Browse…
            </button>

with:

tsx
            <button className="pill-button" onClick={pickSource} disabled={submitting}>
              File…
            </button>
            <button className="pill-button" onClick={pickSourceFolder} disabled={submitting}>
              Folder…
            </button>
2.4 Replace src/main/settings.ts entirely

This version strips the BOM and doesn’t crash on a corrupt file. It keeps the broken file as *.corrupt-<time> instead of overwriting it, fills in missing format keys from the defaults, and writes atomically. It also drops the unused DEFAULT_FIELD_MAPPINGS re-export.

ts
import { app } from 'electron'
import { existsSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FieldMappingsConfig, Settings } from '@shared/types'
import { DEFAULT_FIELD_MAPPINGS } from './import/defaultFieldMappings'
import { readTextFile } from './util/readTextFile'

const DEFAULT_SETTINGS: Settings = {
  fieldMappings: DEFAULT_FIELD_MAPPINGS,
  defaultBackupFolder: null,
  linkModeDefault: false,
  sillytavernBasePath: null,
  autoBackup: {
    enabled: false,
    intervalHours: 24,
    keepCount: 7,
    lastRunAt: null
  }
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

// Kept as its own file (field-mappings.json) per §4.2, separate from the
// rest of settings.json, since it's meant to be user-editable on its own.
function fieldMappingsPath(): string {
  return join(app.getPath('userData'), 'field-mappings.json')
}

/** Reads JSON; on a parse error keeps the broken file as *.corrupt-<time> and returns null. */
function readJsonSafe<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readTextFile(path)) as T
  } catch (err) {
    console.error(`[settings] could not parse ${path}:`, err)
    try {
      renameSync(path, `${path}.corrupt-${Date.now()}`)
    } catch {
      /* ignore */
    }
    return null
  }
}

/** Write to a temp file, then rename, so a crash can't leave a half-written file. */
function writeJsonAtomic(path: string, data: unknown): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, path)
}

/** Fills any missing format entry/keys from the defaults. */
function mergeFieldMappings(saved: Partial<FieldMappingsConfig> | null): FieldMappingsConfig {
  return {
    sillytavern: { ...DEFAULT_FIELD_MAPPINGS.sillytavern, ...(saved?.sillytavern ?? {}) },
    marinara: { ...DEFAULT_FIELD_MAPPINGS.marinara, ...(saved?.marinara ?? {}) },
    flat_v1: { ...DEFAULT_FIELD_MAPPINGS.flat_v1, ...(saved?.flat_v1 ?? {}) }
  }
}

export function loadSettings(): Settings {
  const saved = readJsonSafe<Partial<Settings>>(settingsPath()) ?? {}
  const savedMappings = readJsonSafe<Partial<FieldMappingsConfig>>(fieldMappingsPath())

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    // Deep-merge nested objects so partial files don't wipe out defaults
    autoBackup: { ...DEFAULT_SETTINGS.autoBackup, ...(saved.autoBackup ?? {}) },
    fieldMappings: mergeFieldMappings(savedMappings)
  }

  if (!savedMappings) writeJsonAtomic(fieldMappingsPath(), settings.fieldMappings)

  return settings
}

export function saveSettings(next: Settings): Settings {
  writeJsonAtomic(fieldMappingsPath(), next.fieldMappings)
  const { fieldMappings: _omit, ...rest } = next
  writeJsonAtomic(settingsPath(), rest)
  return next
}
2.5 Replace src/main/windowState.ts entirely

This version debounces the saves, strips the BOM, and ignores a saved position when that monitor no longer exists.

ts
import { app, BrowserWindow, screen } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readTextFile } from './util/readTextFile'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const DEFAULTS: WindowState = { width: 1280, height: 800, maximized: false }

function statePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function isOnSomeDisplay(x: number, y: number): boolean {
  return screen
    .getAllDisplays()
    .some(
      (d) =>
        x >= d.bounds.x &&
        y >= d.bounds.y &&
        x < d.bounds.x + d.bounds.width &&
        y < d.bounds.y + d.bounds.height
    )
}

export function loadWindowState(): WindowState {
  const state: WindowState = { ...DEFAULTS }
  try {
    if (existsSync(statePath())) {
      Object.assign(state, JSON.parse(readTextFile(statePath())))
    }
  } catch {
    /* ignore parse errors */
  }
  // The monitor it was saved on may be unplugged: let Electron center it instead.
  if (state.x !== undefined && state.y !== undefined && !isOnSomeDisplay(state.x, state.y)) {
    delete state.x
    delete state.y
  }
  return state
}

export function saveWindowState(win: BrowserWindow): void {
  try {
    if (win.isDestroyed()) return
    const maximized = win.isMaximized()
    const bounds = win.getNormalBounds()
    if (!isOnSomeDisplay(bounds.x, bounds.y)) return
    const state: WindowState = { ...bounds, maximized }
    writeFileSync(statePath(), JSON.stringify(state, null, 2))
  } catch {
    /* ignore */
  }
}

/** Persists window bounds (debounced while resizing/moving, immediately on close). */
export function trackWindowState(win: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const saveSoon = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => saveWindowState(win), 500)
  }
  win.on('resize', saveSoon)
  win.on('move', saveSoon)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    saveWindowState(win)
  })
}
2.6 src/main/index.ts: single-instance lock

This prevents two windows and two auto-backup timers on one database.

In createWindow, replace:

ts
  trackWindowState(mainWindow)

with:

ts
  trackWindowState(mainWindow)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

Replace everything from app.whenReady() to the end of the file with:

ts
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    const db = getDb()
    handleAppProtocolRequests()
    registerIpcHandlers()
    startAutoBackup(db)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    closeDb()
    if (process.platform !== 'darwin') app.quit()
  })
}

Check:

Run npm run typecheck && npm test.
Run npm run dev and confirm:
Import → File… opens a normal file picker where you can select a .jsonl or .zip.
Restore → Browse… lets you pick a backup .zip.
Importing a .jsonl saved from Notepad (with BOM) works.
Launching a second copy just focuses the first window.
Commit: git commit -am "fix(windows): file pickers, BOM, single instance, safer settings".

If a typecheck error appears, paste it here and I’ll fix the exact line. Once both batches are in, I’ll write Batch 3: the data-loss fixes (attachment filename collisions, backup prune safety, restore folder ordering, bulk-selection reset).

Good, both batches are working. Your usage (SillyTavern chats and the prompt library, nothing else) changes my priorities, so I’m cutting the worker process, typed-IPC rewrite, UI kit and installer work from the near-term plan. The next two batches only touch things you actually use:

Batch 3 is data safety, so your archive can’t get silently damaged.
Batch 4 fixes the things you’d notice day to day: renaming, copying message text, and prompt edits being lost.

Run npm run typecheck && npm test after each batch.

Batch 3: data safety
3.1 New file src/main/util/uniqueDestPath.ts

Two attachments with the same filename currently overwrite each other. This helper picks a free name instead.

ts
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

/** Returns a destination path inside `dir` that doesn't exist yet
 *  ("a.png" -> "a (1).png" -> "a (2).png" ...). */
export function uniqueDestPath(
  dir: string,
  fileName: string
): { destName: string; destPath: string } {
  const ext = extname(fileName)
  const stem = basename(fileName, ext)
  let destName = fileName
  let n = 1
  while (existsSync(join(dir, destName))) {
    destName = `${stem} (${n})${ext}`
    n += 1
  }
  return { destName, destPath: join(dir, destName) }
}
3.2 src/main/import/importChat.ts
Add after the readTextFile import:
ts
  import { uniqueDestPath } from '../util/uniqueDestPath'
Right after the first line of importChat (onProgress?.({ phase: 'reading', current: 0, total: 0 })), add:
ts

  // A .zip is extracted to a temp folder that gets cleaned up, so linking to
  // files inside it would leave dead links. Always copy for zip sources.
  if (input.linkMode && /\.zip$/i.test(input.sourcePath)) {
    input = { ...input, linkMode: false }
  }
Replace:
ts
          const destName = sanitizeFilename(label)
          const destPath = join(managedRoot, destName)
          try {
            copyFileSync(resolvedSourcePath, destPath)
            storedPath = join(String(chatId), destName)

with:

ts
          try {
            const { destName, destPath } = uniqueDestPath(managedRoot, sanitizeFilename(label))
            copyFileSync(resolvedSourcePath, destPath)
            storedPath = join(String(chatId), destName)
3.3 src/main/chats/relinkAttachments.ts

Add import { uniqueDestPath } from '../util/uniqueDestPath' after the guessMimeType import, then replace:

ts
      const destName = sanitizeFilename(basename(foundPath))
      const destPath = join(managedRoot, destName)
      try {
        copyFileSync(foundPath, destPath)

with:

ts
      try {
        const { destName, destPath } = uniqueDestPath(
          managedRoot,
          sanitizeFilename(basename(foundPath))
        )
        copyFileSync(foundPath, destPath)

The next lines (const storedPath = join(...), const mime = guessMimeType(destName), …) stay as they are.

3.4 Backups: safe writes and no accidental pruning

Right now auto-backup pruning deletes every backup-*.zip in the folder, including your manual backups if they share a folder. A crash mid-write also leaves a half zip that looks like a real backup.

src/shared/types.ts: in BackupExportInput, add after includeLinkMode: boolean:

ts
  /** Filename prefix. Auto-backups use "auto-backup" so pruning never touches manual ones. */
  filePrefix?: string

src/main/backup/backupExport.ts

Replace the fs import with:
ts
  import { createWriteStream, existsSync, renameSync, unlinkSync } from 'node:fs'
Replace everything from const destPath = join(input.destPath, ... down to and including the output.on('close', ...) line with:
ts
      const prefix = input.filePrefix ?? 'backup'
      const destPath = join(input.destPath, `${prefix}-${timestamp}.zip`)
      const tmpPath = `${destPath}.tmp` // renamed to .zip only once fully written

      const output = createWriteStream(tmpPath)
      const archive = archiver('zip', { zlib: { level: 6 } })

      const fail = (err: Error): void => {
        try {
          unlinkSync(tmpPath)
        } catch {
          /* ignore */
        }
        reject(err)
      }
      archive.on('error', fail)
      output.on('error', fail)
      output.on('close', () => {
        try {
          renameSync(tmpPath, destPath)
          resolve({ path: destPath, chatCount, fileCount })
        } catch (err) {
          fail(err as Error)
        }
      })
Replace let fileCount = 0 with:
ts
      let fileCount = 0
      const addedEntries = new Set<string>()
Replace:
ts
          const filename = att.stored_path.split(/[\\/]/).pop() ?? String(att.id)
          archive.file(diskPath, { name: `chats/${(chat as { id: number }).id}/attachments/${filename}` })
          fileCount += 1

with:

ts
          const filename = att.stored_path.split(/[\\/]/).pop() ?? String(att.id)
          const entryName = `chats/${(chat as { id: number }).id}/attachments/${filename}`
          if (addedEntries.has(entryName)) continue // legacy rows sharing one file
          addedEntries.add(entryName)
          archive.file(diskPath, { name: entryName })
          fileCount += 1

src/main/backup/autoBackup.ts

Replace .filter((f) => /^backup-.*\.zip$/.test(f)) with:
ts
        .filter((f) => /^auto-backup-.*\.zip$/.test(f))
Replace the exportBackup(db, { ... }) call with:
ts
      await exportBackup(db, {
        destPath: settings.defaultBackupFolder,
        scope: 'all',
        includeLinkMode: false,
        filePrefix: 'auto-backup'
      })

Your existing backup-*.zip files are now never pruned automatically. That’s the safe direction.

3.5 Replace src/main/backup/backupRestore.ts entirely

This fixes these bugs:

Folders were restored in the wrong order when nested more than one level deep.
Trashed folders came back as live ones.
Restored images got a broken link_mode.
The replace strategy left the old attachment folder behind.
Temp folders were never deleted.
ts
import AdmZip from 'adm-zip'
import type Database from 'better-sqlite3'
import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BackupCheckResult, BackupRestoreInput, MergeStrategy, RestoreResult } from '@shared/types'
import { sanitizeFilename } from '../import/sanitizeFilename'
import { readTextFile } from '../util/readTextFile'

const SUPPORTED_VERSIONS = [1]

interface FolderRow {
  id: number
  parent_id: number | null
  name: string
  position: number
  color: string | null
  icon: string | null
  is_system: 0 | 1
  is_trashed?: 0 | 1
}
interface ChatBundle {
  chat: Record<string, unknown>
  messages: Record<string, unknown>[]
  attachments: Record<string, unknown>[]
  tagIds?: number[]
}
interface PromptSetRow {
  id: number
  name: string
}
interface PromptBlockRow {
  id: number
  set_id: number
  name: string
  role: string
  content: string
  enabled: number
  position: number
}

function readJson(tempDir: string, relativePath: string): unknown {
  const full = join(tempDir, relativePath)
  if (!existsSync(full)) return null
  return JSON.parse(readTextFile(full))
}

/** Pre-restore check: returns manifest info and a preview without writing anything. */
export function checkBackup(sourcePath: string): BackupCheckResult {
  const tempDir = mkdtempSync(join(tmpdir(), 'chat-archiver-check-'))
  try {
    const zip = new AdmZip(sourcePath)
    zip.extractAllTo(tempDir, true)

    const manifest = readJson(tempDir, 'manifest.json') as Record<string, unknown> | null
    if (!manifest) {
      return { valid: false, error: 'No manifest.json — not a valid backup', manifest: null, previewTitles: [] }
    }
    if (!SUPPORTED_VERSIONS.includes(manifest.version as number)) {
      return { valid: false, error: `Unsupported backup version ${manifest.version}`, manifest: null, previewTitles: [] }
    }

    const previewTitles: string[] = []
    const chatDirs = zip
      .getEntries()
      .filter((e) => e.entryName.match(/^chats\/\d+\/chat\.json$/))
      .slice(0, 5)
    for (const entry of chatDirs) {
      const bundle = readJson(tempDir, entry.entryName) as ChatBundle | null
      if (bundle?.chat?.title) previewTitles.push(bundle.chat.title as string)
    }

    return {
      valid: true,
      manifest: {
        version: manifest.version as number,
        exportedAt: manifest.exportedAt as string,
        chatCount: manifest.chatCount as number,
        fileCount: manifest.fileCount as number,
        hasPrompts: !!manifest.hasPrompts,
        hasTags: !!manifest.hasTags
      },
      previewTitles
    }
  } catch (err) {
    return { valid: false, error: String(err), manifest: null, previewTitles: [] }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function remapFolders(db: Database.Database, backupFolders: FolderRow[]): Map<number, number> {
  const remap = new Map<number, number>()
  const byId = new Map(backupFolders.map((f) => [f.id, f]))

  // Process parents before children, however deep the nesting goes.
  const depth = (f: FolderRow): number => {
    let d = 0
    let cur: FolderRow | undefined = f
    const seen = new Set<number>()
    while (cur && cur.parent_id !== null && !seen.has(cur.id)) {
      seen.add(cur.id)
      d += 1
      cur = byId.get(cur.parent_id)
    }
    return d
  }
  const sorted = [...backupFolders].sort((a, b) => depth(a) - depth(b))

  for (const f of sorted) {
    if (f.is_system || f.is_trashed) continue // don't resurrect deleted folders
    const remappedParentId = f.parent_id === null ? null : (remap.get(f.parent_id) ?? null)
    const existing = db
      .prepare(`SELECT id FROM folders WHERE name = ? AND (parent_id IS ? OR parent_id = ?) AND is_trashed = 0`)
      .get(f.name, remappedParentId, remappedParentId) as { id: number } | undefined
    if (existing) {
      remap.set(f.id, existing.id)
    } else {
      const next = (
        db
          .prepare(`SELECT COALESCE(MAX(position),-1)+1 AS n FROM folders WHERE parent_id IS ?`)
          .get(remappedParentId) as { n: number }
      ).n
      const r = db
        .prepare(`INSERT INTO folders (parent_id, name, position, color, icon) VALUES (?,?,?,?,?)`)
        .run(remappedParentId, f.name, next, f.color, f.icon)
      remap.set(f.id, Number(r.lastInsertRowid))
    }
  }
  return remap
}

function findExistingChat(
  db: Database.Database,
  bundle: ChatBundle,
  strategy: MergeStrategy
): { action: 'skip' | 'replace' | 'insert'; existingId?: number } {
  if (strategy === 'duplicate') return { action: 'insert' }
  const existing = db
    .prepare(`SELECT id FROM chats WHERE title = ? AND character_name IS ? AND message_count = ? AND is_trashed = 0`)
    .get(bundle.chat.title, bundle.chat.character_name ?? null, bundle.messages.length) as
    | { id: number }
    | undefined
  if (!existing) return { action: 'insert' }
  if (strategy === 'skip') return { action: 'skip' }
  return { action: 'replace', existingId: existing.id }
}

export function restoreBackup(db: Database.Database, input: BackupRestoreInput): RestoreResult {
  const tempDir = mkdtempSync(join(tmpdir(), 'chat-archiver-restore-'))
  try {
    return restoreFromDir(db, input, tempDir)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function restoreFromDir(db: Database.Database, input: BackupRestoreInput, tempDir: string): RestoreResult {
  const zip = new AdmZip(input.sourcePath)
  zip.extractAllTo(tempDir, true)

  const manifest = readJson(tempDir, 'manifest.json') as { version: number } | null
  if (!manifest) throw new Error('Not a valid Chat Archiver backup (no manifest.json)')
  if (!SUPPORTED_VERSIONS.includes(manifest.version)) {
    throw new Error(`Backup version ${manifest.version} not supported`)
  }

  const backupFolders = (readJson(tempDir, 'folders.json') as FolderRow[] | null) ?? []
  const tagsData = readJson(tempDir, 'tags.json') as {
    tags: { id: number; name: string; color: string | null }[]
    chatTags: { chat_id: number; tag_id: number }[]
  } | null
  const backupPromptsFile = readJson(tempDir, 'prompts.json') as
    | { promptSets: PromptSetRow[]; promptBlocks: PromptBlockRow[] }
    | null
  const backupPromptSets = backupPromptsFile?.promptSets ?? []
  const backupPromptBlocks = backupPromptsFile?.promptBlocks ?? []

  let chatsImported = 0
  let chatsSkipped = 0
  let chatsReplaced = 0
  let foldersCreated = 0
  let tagsRestored = 0
  let promptsImported = 0
  const replacedChatIds: number[] = []

  const run = db.transaction(() => {
    // ---- folders ----
    const folderCountBefore = (db.prepare(`SELECT COUNT(*) AS n FROM folders`).get() as { n: number }).n
    const folderRemap = remapFolders(db, backupFolders)
    foldersCreated =
      (db.prepare(`SELECT COUNT(*) AS n FROM folders`).get() as { n: number }).n - folderCountBefore

    // ---- tags ----
    const tagIdRemap = new Map<number, number>()
    if (tagsData) {
      for (const tag of tagsData.tags) {
        const existing = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(tag.name) as
          | { id: number }
          | undefined
        if (existing) {
          tagIdRemap.set(tag.id, existing.id)
        } else {
          const r = db.prepare(`INSERT INTO tags (name, color) VALUES (?,?)`).run(tag.name, tag.color)
          tagIdRemap.set(tag.id, Number(r.lastInsertRowid))
          tagsRestored += 1
        }
      }
    }

    // ---- prompt sets + blocks ----
    // Whole-set granularity: skip a set entirely if one with the same name
    // already exists, else recreate the set and every block inside it.
    for (const set of backupPromptSets) {
      const existingSet = db.prepare(`SELECT id FROM prompt_sets WHERE name = ?`).get(set.name)
      if (existingSet) continue

      const setResult = db.prepare(`INSERT INTO prompt_sets (name) VALUES (?)`).run(set.name)
      const newSetId = Number(setResult.lastInsertRowid)

      const blocksForSet = backupPromptBlocks
        .filter((b) => b.set_id === set.id)
        .sort((a, b) => a.position - b.position)

      for (const block of blocksForSet) {
        db.prepare(
          `INSERT INTO prompt_blocks (set_id, name, role, content, enabled, position)
           VALUES (?,?,?,?,?,?)`
        ).run(newSetId, block.name, block.role, block.content, block.enabled, block.position)
        promptsImported += 1
      }
    }

    // ---- chats ----
    const chatDirs = zip
      .getEntries()
      .map((e) => e.entryName.match(/^chats\/(\d+)\/chat\.json$/)?.[1] ?? null)
      .filter((id): id is string => id !== null)
      .filter((id, i, arr) => arr.indexOf(id) === i)

    for (const chatIdStr of chatDirs) {
      const bundle = readJson(tempDir, `chats/${chatIdStr}/chat.json`) as ChatBundle | null
      if (!bundle) continue

      const { action, existingId } = findExistingChat(db, bundle, input.mergeStrategy)
      if (action === 'skip') {
        chatsSkipped += 1
        continue
      }
      if (action === 'replace' && existingId !== undefined) {
        db.prepare(`DELETE FROM chats WHERE id = ?`).run(existingId)
        replacedChatIds.push(existingId) // its attachment folder is removed after commit
        chatsReplaced += 1
      }

      const originalFolderId = typeof bundle.chat.folder_id === 'number' ? bundle.chat.folder_id : null
      const remappedFolderId = originalFolderId === null ? null : (folderRemap.get(originalFolderId) ?? null)

      const chatResult = db
        .prepare(
          `INSERT INTO chats (folder_id, title, source_format, character_name, user_name, message_count, attachment_count, chat_metadata, original_source_path, imported_at)
           VALUES (?,?,?,?,?,?,0,?,?,?)`
        )
        .run(
          remappedFolderId,
          bundle.chat.title,
          bundle.chat.source_format,
          bundle.chat.character_name ?? null,
          bundle.chat.user_name ?? null,
          bundle.messages.length,
          bundle.chat.chat_metadata ?? null,
          bundle.chat.original_source_path ?? null,
          bundle.chat.imported_at ?? new Date().toISOString()
        )
      const newChatId = Number(chatResult.lastInsertRowid)

      // messages
      const insertMsg = db.prepare(
        `INSERT INTO messages (chat_id, seq, sender_name, is_user, send_date, text, raw_json) VALUES (?,?,?,?,?,?,?)`
      )
      const msgIdMap = new Map<number, number>()
      for (const msg of bundle.messages) {
        const r = insertMsg.run(
          newChatId,
          msg.seq,
          msg.sender_name ?? null,
          msg.is_user ?? 0,
          msg.send_date ?? null,
          msg.text ?? null,
          msg.raw_json
        )
        if (typeof msg.id === 'number') msgIdMap.set(msg.id, Number(r.lastInsertRowid))
      }

      // attachments
      const managedRoot = join(app.getPath('userData'), 'attachments', String(newChatId))
      mkdirSync(managedRoot, { recursive: true })
      const insertAtt = db.prepare(
        `INSERT INTO attachments (message_id, label, original_ref, stored_path, mime_type, link_mode, missing) VALUES (?,?,?,?,?,?,?)`
      )
      let attachmentCount = 0
      for (const att of bundle.attachments) {
        const newMsgId = typeof att.message_id === 'number' ? msgIdMap.get(att.message_id) : undefined
        if (!newMsgId) continue
        const attFilename =
          typeof att.stored_path === 'string'
            ? (att.stored_path.split(/[\\/]/).pop() ?? String(att.id))
            : String(att.id)
        const backedUpPath = join(tempDir, 'chats', chatIdStr, 'attachments', attFilename)
        const sanitized = sanitizeFilename(attFilename)
        const destPath = join(managedRoot, sanitized)
        let missing = 1
        if (existsSync(backedUpPath)) {
          try {
            copyFileSync(backedUpPath, destPath)
            missing = 0
          } catch {
            /* leave missing */
          }
        }
        insertAtt.run(
          newMsgId,
          att.label ?? null,
          att.original_ref ?? null,
          missing === 0 ? join(String(newChatId), sanitized) : (att.stored_path ?? ''),
          att.mime_type ?? null,
          // a restored file now lives in managed storage, so it is never "link mode"
          missing === 0 ? 0 : (att.link_mode ?? 0),
          missing
        )
        if (missing === 0) attachmentCount += 1
      }
      db.prepare(`UPDATE chats SET attachment_count = ? WHERE id = ?`).run(attachmentCount, newChatId)

      // tag assignments
      if (bundle.tagIds && Array.isArray(bundle.tagIds)) {
        for (const backupTagId of bundle.tagIds) {
          const newTagId = tagIdRemap.get(backupTagId)
          if (newTagId) {
            db.prepare(`INSERT OR IGNORE INTO chat_tags (chat_id, tag_id) VALUES (?,?)`).run(newChatId, newTagId)
          }
        }
      }
      // also restore from the global chatTags list (older backup format compat)
      if (tagsData) {
        for (const ct of tagsData.chatTags) {
          if (String(ct.chat_id) === chatIdStr) {
            const newTagId = tagIdRemap.get(ct.tag_id)
            if (newTagId) {
              db.prepare(`INSERT OR IGNORE INTO chat_tags (chat_id, tag_id) VALUES (?,?)`).run(newChatId, newTagId)
            }
          }
        }
      }

      chatsImported += 1
    }
  })

  run()

  // Only after the transaction committed: delete the files of replaced chats.
  for (const id of replacedChatIds) {
    rmSync(join(app.getPath('userData'), 'attachments', String(id)), { recursive: true, force: true })
  }

  return { chatsImported, chatsSkipped, chatsReplaced, foldersCreated, tagsRestored, promptsImported }
}
3.6 src/main/index.ts: clean up leftover temp folders at startup
Add these imports at the top:
ts
  import { readdirSync, rmSync } from 'node:fs'
  import { tmpdir } from 'node:os'
Add this function above const gotSingleInstanceLock:
ts
  /** Zip imports and backup checks extract into the OS temp dir; sweep leftovers. */
  function cleanupStaleTempDirs(): void {
    try {
      for (const name of readdirSync(tmpdir())) {
        if (name.startsWith('chat-archiver-')) {
          rmSync(join(tmpdir(), name), { recursive: true, force: true })
        }
      }
    } catch {
      /* ignore */
    }
  }
Inside app.whenReady().then(() => {, make this the first line:
ts
      cleanupStaleTempDirs()
3.7 src/renderer/src/components/chatlist/ChatList.tsx: stale bulk selection

Bulk trash and delete could act on chats that were no longer on screen after you switched folder or searched. Add this effect directly below the existing useEffect that resets on [isTrashView]:

ts
  // Drop selected ids that are no longer in the visible list (folder/search/tag switch, etc.)
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(chats.map((c) => c.id))
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [chats])

Test Batch 3:

Create a backup into a folder and check you get a .zip with no leftover .tmp.
Restore it with Replace.
Import a chat twice with Import Anyway. Its images should still show.
Batch 4: things you use daily
4.1 Renaming a chat actually shows

Cards and the viewer header displayed character_name first, so a rename changed nothing visible.

src/renderer/src/components/chatlist/ChatList.tsx: in ChatCard, replace:

tsx
            {chat.character_name ?? chat.title}

with:

tsx
            {chat.title}

src/renderer/src/components/viewer/ChatViewer.tsx: replace {detail.chat.character_name ?? detail.chat.title} (in the header) with:

tsx
{detail.chat.title}

Imported chats already have title set to the character name, so nothing looks different until you rename one. One side effect: a renamed chat won’t be caught by the duplicate check if you re-import it, because that compares titles.

4.2 Make message text selectable and copyable

body { user-select: none } blocks copying text out of chats.

src/renderer/src/styles/theme.css: add at the end of the file:

css
.selectable {
  user-select: text;
  cursor: text;
}

src/renderer/src/components/viewer/ChatViewer.tsx: change <div style={{ to <div className="selectable" style={{ on the two lines that sit directly above background: 'var(--bubble-user-bg)', and above background: 'var(--bubble-char-bg)',.

4.3 Prompt library: autosave instead of silently losing edits

Right now, if you type in a block and click another block (or another set, or press Ctrl+P), your edit is gone.

src/renderer/src/components/PromptsLibrary.tsx

Change the React import to:
ts
  import { useEffect, useRef, useState } from 'react'
Replace everything from function BlockContentEditor({ down to, but not including, the return ( of that function with:
tsx
  function BlockContentEditor({
    block, onSave, onDelete
  }: {
    block: PromptBlock
    onSave: (patch: { name: string; role: PromptRole; content: string }) => Promise<void>
    onDelete: () => void
  }): JSX.Element {
    const [name, setName] = useState(block.name)
    const [role, setRole] = useState<PromptRole>(block.role)
    const [content, setContent] = useState(block.content)
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)

    // Always-current values, used by the autosave timer and the unmount flush.
    const latest = useRef({ name, role, content, dirty, onSave })
    latest.current = { name, role, content, dirty, onSave }

    function mark<T>(setter: (v: T) => void): (v: T) => void {
      return (v) => { setter(v); setDirty(true) }
    }

    async function save(): Promise<void> {
      const snap = latest.current
      setSaving(true)
      try {
        await snap.onSave({ name: snap.name, role: snap.role, content: snap.content })
        const cur = latest.current
        // only clear "dirty" if nothing was typed while the save was running
        if (cur.name === snap.name && cur.role === snap.role && cur.content === snap.content) {
          setDirty(false)
        }
      } finally {
        setSaving(false)
      }
    }

    // Autosave 0.8s after the last keystroke.
    useEffect(() => {
      if (!dirty) return
      const t = setTimeout(() => { void save() }, 800)
      return () => clearTimeout(t)
    }, [name, role, content, dirty]) // eslint-disable-line react-hooks/exhaustive-deps

    // Flush pending edits when switching blocks/sets or leaving the view.
    useEffect(() => {
      return () => {
        const l = latest.current
        if (l.dirty) void l.onSave({ name: l.name, role: l.role, content: l.content })
      }
    }, [])

Leave the existing return ( and everything after it unchanged. The “Save” button still works as a manual save, and it now shows “Saved” shortly after you stop typing.

Test Batch 4:

Rename a chat and check the new name shows on the card and in the viewer header.
Select and copy a message with the mouse.
Type in a prompt block, immediately click another block, then click back. Your text should still be there.
What’s next

Once these pass, the next fixes for your use case are:

SillyTavern date formats: send_date values like January 5, 2026 10:00am currently show blank timestamps.
System and hidden messages: SillyTavern’s is_system messages currently show as character bubbles.
Missing images: relink matching and clearer “missing” reporting.
Prompt library: import and export of SillyTavern preset JSON.

One question, since you only use SillyTavern: do you want me to strip the app down to SillyTavern only? That would remove the Marinara and flat_v1 parsers, their fixtures and tests, and the format-detection branches. It would simplify the import code a lot. I’d keep the Field Mappings screen, since it’s your safety net if SillyTavern changes its export format. If you’d rather keep the other formats in case you ever need them, say so and I’ll leave them alone.

what about folders or files, none needs to be removed?

Almost nothing needs deleting. I checked every source file against its imports, and each one is used by something. Most of the cleanup was inside files, which Batch 1 covered. What’s left:

Safe to remove or change now

README.md: it still describes “Phase 1 scaffolding” and “stub” channels, which is no longer true. Rewrite it rather than delete it.
chat-archiver-build-spec.md: nothing loads it at runtime, and it’s partly outdated (it says LIKE search and no prompt library, for example). Some code comments cite its section numbers (§4.2, §6), so I’d move it to a docs/ folder instead of deleting it. If you don’t care about those references, deleting it is harmless.

Only if you go SillyTavern-only (this is the question from my last message)

src/main/import/__fixtures__/marinara.chat.jsonl
src/main/import/__fixtures__/flat_v1.chat.jsonl
The Marinara and flat_v1 test blocks in parseByFieldMapping.test.ts and detectFormat.test.ts
Matching code edits in defaultFieldMappings.ts, detectFormat.ts, FieldMappingsSettings.tsx and shared/types.ts

That would be its own batch, and no whole source files would go. It’s all fixtures and edits inside files.

Don’t delete these, even though they look old

003_prompts.sql and 004_prompt_sets.sql: 004 reads from the prompts table that 003 creates. If you delete 003, a fresh install fails at 004. Your existing database also has both recorded as applied. Squashing them is possible later, but it needs a proper baseline migration first.
preload/index.d.ts, env.d.ts, tsconfig.json, vitest.config.ts, testDb.ts: these look like stubs but the build or tests need them.

Dependencies: every package in package.json is imported somewhere, so there’s nothing to uninstall.

One misplaced file: TagsSettings.tsx sits in components/sidebar/ but is a Settings screen. It works fine there, so moving it is optional.

I can only see the files you attached. I can’t see .gitignore, an icons or resources/ folder, or package-lock.json. Check that out/, release/ and node_modules/ are in .gitignore. If they’re missing, they’re the folders that will bloat your repo, and you can delete out/ and release/ at any time since npm run build regenerates them.

Features you might not use: the Library Stats screen (LibraryStatsView.tsx, statsRepo.ts and its test, plus its IPC and preload entries) and Tags are the two biggest pieces. Stats is easy to remove cleanly. Tags is more spread out, so I’d keep it unless you’re sure you never use it.

Which do you want: SillyTavern-only, removing Stats, both, or neither?

there isnt a gotSingleInstanceLock function in index.ts. also where in chatlist do i add the drop selected ids code section.also checks your instructions from 4.2. i havent made those changes yet. make sure they are right

Two of these were my fault. The third (4.2) checks out.

1. index.ts: the lock isn’t missing, step 2.6 probably wasn’t applied

gotSingleInstanceLock is a const, not a function. It only exists if step 2.6 was applied. Since it’s not in your file, 2.6 likely got skipped or only partly done. That also means the single-instance lock isn’t active yet.

Replace your whole src/main/index.ts with this. It contains 2.6 and 3.6 together, so there’s nothing to position by hand:

ts
import { app, BrowserWindow, shell } from 'electron'
import { readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from './db'
import { registerIpcHandlers } from './ipc/register'
import { registerAppProtocolScheme, handleAppProtocolRequests } from './attachments/serveAttachment'
import { loadWindowState, trackWindowState } from './windowState'
import { startAutoBackup } from './backup/autoBackup'

registerAppProtocolScheme() // must run before app is ready

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const state = loadWindowState()

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e22',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (state.maximized) mainWindow.maximize()

  trackWindowState(mainWindow)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Open external links (e.g. from an eventual "about" screen) in the
  // system browser instead of navigating the app window.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite sets ELECTRON_RENDERER_URL in dev mode (vite dev server);
  // in a packaged/built app it's unset and we load the built HTML file.
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Zip imports and backup checks extract into the OS temp dir; sweep leftovers. */
function cleanupStaleTempDirs(): void {
  try {
    for (const name of readdirSync(tmpdir())) {
      if (name.startsWith('chat-archiver-')) {
        rmSync(join(tmpdir(), name), { recursive: true, force: true })
      }
    }
  } catch {
    /* ignore */
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    cleanupStaleTempDirs()
    const db = getDb()
    handleAppProtocolRequests()
    registerIpcHandlers()
    startAutoBackup(db)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    closeDb()
    if (process.platform !== 'darwin') app.quit()
  })
}

To test it, run npm run dev and start a second copy. It should just focus the first window.

2. ChatList.tsx: where the effect goes

Near the top of the ChatList component, find this existing effect:

ts
  // Reset selection when the underlying list changes context (folder/tag/search switch)
  useEffect(() => {
    setSelectedIds(new Set())
    setSelectionMode(false)
  }, [isTrashView])

Paste the new one directly under it, leaving a blank line between them:

ts
  // Drop selected ids that are no longer in the visible list (folder/search/tag switch, etc.)
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(chats.map((c) => c.id))
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [chats])

It must stay above the if (chats.length === 0) { return (...) } early return further down. React requires hooks to run before any early return, and this placement satisfies that.

3. Step 4.2 is correct

I checked it against your ChatViewer.tsx. The two target <div>s are the only ones directly above those two background: lines, so there’s no ambiguity. Here are the exact edits.

src/renderer/src/styles/theme.css: add at the very end:

css
.selectable {
  user-select: text;
  cursor: text;
}

ChatViewer.tsx, in MessageBubble, there are two edits:

User bubble. Find:
tsx
               <div style={{
                 background: 'var(--bubble-user-bg)',

Replace with:

tsx
               <div className="selectable" style={{
                 background: 'var(--bubble-user-bg)',
Character bubble. Find:
tsx
             <div style={{
               background: 'var(--bubble-char-bg)',

Replace with:

tsx
             <div className="selectable" style={{
               background: 'var(--bubble-char-bg)',
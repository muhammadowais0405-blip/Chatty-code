import AdmZip from 'adm-zip'
import { app } from 'electron'
import { existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Resolves any of these inputs to a working directory:
 *
 *  - A .zip file          → extracted to a temp dir
 *  - A .jsonl/.txt file   → use its parent directory directly
 *  - A folder             → use it as-is
 *
 * The working dir is expected to contain a .jsonl chat file (any name)
 * and optionally an attachment/ or attachments/ subfolder.
 */
export function resolveWorkingDir(sourcePath: string): string {
  const stat = statSync(sourcePath)

  // Direct JSONL/TXT selection — use its parent as the working dir.
  if (stat.isFile()) {
    const lower = sourcePath.toLowerCase()
    if (lower.endsWith('.jsonl') || lower.endsWith('.txt')) {
      return dirname(sourcePath)
    }

    if (lower.endsWith('.zip')) {
      const tempRoot = mkdtempSync(join(tmpdir(), 'chat-archiver-import-'))
      const zip = new AdmZip(sourcePath)
      zip.extractAllTo(tempRoot, true)

      // Some exporters wrap everything in a single top-level folder inside
      // the zip; if a chat file isn't at the root, look one level down.
      if (hasChatFile(tempRoot)) return tempRoot
      const entries = readdirSync(tempRoot, { withFileTypes: true })
      const singleDir = entries.find((e) => e.isDirectory())
      if (entries.length === 1 && singleDir && hasChatFile(join(tempRoot, singleDir.name))) {
        return join(tempRoot, singleDir.name)
      }
      return tempRoot
    }

    throw new Error(
      `Unsupported file type: ${sourcePath}\nExpected a .jsonl file, .zip archive, or a folder containing a .jsonl file.`
    )
  }

  if (stat.isDirectory()) {
    return sourcePath
  }

  throw new Error(`Cannot import: ${sourcePath} is not a file or directory.`)
}

/** Returns true if the directory contains any .jsonl or .txt file. */
function hasChatFile(dir: string): boolean {
  try {
    return readdirSync(dir).some(
      (f) => f.toLowerCase().endsWith('.jsonl') || f.toLowerCase().endsWith('.txt')
    )
  } catch {
    return false
  }
}

/**
 * Finds the chat file in a working directory.
 * Prefers 'chat.jsonl' for backwards-compat with the old hardcoded name,
 * then falls back to the first .jsonl found, then the first .txt.
 * Throws with a clear message listing what IS in the folder if nothing found.
 */
export function findChatFile(workingDir: string): string {
  // Canonical name first
  if (existsSync(join(workingDir, 'chat.jsonl'))) return join(workingDir, 'chat.jsonl')
  if (existsSync(join(workingDir, 'chat.txt'))) return join(workingDir, 'chat.txt')

  // Any .jsonl in the folder
  let entries: string[] = []
  try {
    entries = readdirSync(workingDir)
  } catch {
    throw new Error(`Cannot read directory: ${workingDir}`)
  }

  const jsonl = entries.find((f) => f.toLowerCase().endsWith('.jsonl'))
  if (jsonl) return join(workingDir, jsonl)

  const txt = entries.find((f) => f.toLowerCase().endsWith('.txt'))
  if (txt) return join(workingDir, txt)

  const listed = entries.slice(0, 10).join(', ') || '(empty)'
  throw new Error(
    `No .jsonl or .txt chat file found in ${workingDir}\n` +
      `Files present: ${listed}${entries.length > 10 ? ` … (${entries.length} total)` : ''}\n` +
      `Tip: point the source at the folder containing your .jsonl file, ` +
      `not the attachment subfolder inside it.`
  )
}

/** Managed attachments root for a given chat, per §3 filesystem layout. */
export function attachmentsRootForChat(chatId: number): string {
  return join(app.getPath('userData'), 'attachments', String(chatId))
}

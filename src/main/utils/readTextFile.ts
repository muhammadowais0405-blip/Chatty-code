import { readFileSync } from 'node:fs'

/** Reads a UTF-8 text file and strips a leading BOM (Windows Notepad adds one). */
export function readTextFile(path: string): string {
  const raw = readFileSync(path, 'utf-8')
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
}
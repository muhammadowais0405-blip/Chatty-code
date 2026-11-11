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
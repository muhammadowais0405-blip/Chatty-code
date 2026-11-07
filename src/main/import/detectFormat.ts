import type { SourceFormat } from '@shared/types'

export interface DetectedFormat {
  format: SourceFormat
  /** True if line 0 is a SillyTavern-style header (not itself a message). */
  hasHeaderLine: boolean
  headerObj: Record<string, unknown> | null
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * §4.1 table:
 *  - `mes` key anywhere in file, OR a first-line header shaped like
 *    {user_name, character_name, chat_metadata} -> sillytavern
 *  - flat shape {index, role, name, time, text, attachments} per line,
 *    no header line -> flat_v1
 *  - whatever Marinara's CONFIG produced, unverified/no fixed shape ->
 *    marinara (best-effort heuristic fallback, see note below)
 *  - none of the above -> unknown
 *
 * Marinara has no reliable fixed shape per the spec, so it's detected as
 * a fallback: message-like objects (has a name/sender-ish field plus one
 * of the candidate text fields) that don't match the other two shapes.
 */
export function detectFormat(parsedLines: unknown[]): DetectedFormat {
  if (parsedLines.length === 0) {
    return { format: 'unknown', hasHeaderLine: false, headerObj: null }
  }

  const first = parsedLines[0]
  const hasHeaderLine =
    isObj(first) && 'user_name' in first && 'character_name' in first && 'chat_metadata' in first

  const messageLines = hasHeaderLine ? parsedLines.slice(1) : parsedLines

  const anyHasMesKey = parsedLines.some((line) => isObj(line) && 'mes' in line)
  if (hasHeaderLine || anyHasMesKey) {
    return {
      format: 'sillytavern',
      hasHeaderLine,
      headerObj: hasHeaderLine ? (first as Record<string, unknown>) : null
    }
  }

  const looksFlatV1 =
    messageLines.length > 0 &&
    messageLines.every(
      (line) =>
        isObj(line) &&
        'role' in line &&
        'time' in line &&
        'text' in line &&
        (line.attachments === undefined || Array.isArray(line.attachments))
    )
  if (looksFlatV1) {
    return { format: 'flat_v1', hasHeaderLine: false, headerObj: null }
  }

  const marinaraTextFields = ['mes', 'text', 'content', 'message']
  const looksMarinara =
    messageLines.length > 0 &&
    messageLines.every(
      (line) =>
        isObj(line) &&
        marinaraTextFields.some((f) => f in line) &&
        ('is_user' in line || 'role' in line || 'name' in line)
    )
  if (looksMarinara) {
    return { format: 'marinara', hasHeaderLine: false, headerObj: null }
  }

  return { format: 'unknown', hasHeaderLine, headerObj: hasHeaderLine ? first : null }
}

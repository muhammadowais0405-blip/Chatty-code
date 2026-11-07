/**
 * Resolves the `attachmentPaths` dot/bracket syntax from §4.2:
 * `foo.bar[].baz` means "for each item in array foo.bar, take .baz".
 * A trailing `[]` with nothing after it (e.g. `attachments[]`) means the
 * array itself holds the leaf values (strings).
 *
 * Returns every resolved leaf string, skipping anything that isn't a
 * non-empty string once resolved (so a malformed/missing path just
 * contributes nothing rather than throwing).
 */
export function resolveAttachmentPath(obj: unknown, path: string): string[] {
  const segments = path.split('.').filter(Boolean)
  return walk(obj, segments)
}

export function resolveAttachmentPaths(obj: unknown, paths: string[]): string[] {
  const out: string[] = []
  for (const path of paths) out.push(...resolveAttachmentPath(obj, path))
  return out
}

function walk(current: unknown, segments: string[]): string[] {
  if (current === null || current === undefined) return []

  if (segments.length === 0) {
    return typeof current === 'string' && current.length > 0 ? [current] : []
  }

  const [rawSegment, ...rest] = segments
  const isArraySegment = rawSegment.endsWith('[]')
  const key = isArraySegment ? rawSegment.slice(0, -2) : rawSegment

  // key === '' happens for a bare "[]" segment (current itself is the array)
  const value = key === '' ? current : (current as Record<string, unknown>)?.[key]

  if (isArraySegment) {
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => walk(item, rest))
  }

  return walk(value, rest)
}

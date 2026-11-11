import type { Tag } from '@shared/types'

/** Parses the tagSummary field from ChatSummary into a proper Tag array.
 *  Format: "id|name|color,id|name|color,..."
 *  Color is empty string when null. */
export function parseChatTagSummary(tagSummary: string | null): Tag[] {
  if (!tagSummary) return []
  return tagSummary.split(',').map((chunk) => {
    const [rawId, name, color] = chunk.split('|')
    return {
      id: Number(rawId),
      name: name ?? '',
      color: color || null
    }
  })
}

export const TAG_COLORS = [
  '#8b5cf6', '#e5484d', '#f5a524', '#3dd68c',
  '#22b8cf', '#4f8ff7', '#d6409f', '#a9a7b4',
  '#c2410c', '#65a30d'
]

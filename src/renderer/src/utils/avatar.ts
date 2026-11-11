const AVATAR_COLORS = [
  '#6d4fc2', // purple
  '#2d7a5e', // teal
  '#c2404a', // red
  '#4a6fc2', // blue
  '#c27a30', // amber
  '#9b4fc2', // violet
  '#4f8fc2', // sky
  '#7a6c2d'  // olive
]

export function avatarColor(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

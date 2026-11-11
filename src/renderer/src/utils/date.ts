const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
]

function to24h(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour
  const h = hour % 12
  return meridiem.toLowerCase() === 'pm' ? h + 12 : h
}

/** Parses the send_date formats SillyTavern has produced over the years.
 *  Returns null when the value can't be understood. */
export function parseSendDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null

  // Epoch seconds (10 digits) or milliseconds (13 digits)
  if (/^\d{9,13}$/.test(s)) {
    const n = Number(s)
    return new Date(s.length <= 10 ? n * 1000 : n)
  }

  // "January 5, 2026 10:00am" / "Jan 5, 2026 3:45 PM"
  const named = s.match(
    /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i
  )
  if (named) {
    const prefix = named[1].toLowerCase().slice(0, 3)
    const month = MONTHS.findIndex((m) => m.slice(0, 3) === prefix)
    if (month === -1) return null
    return new Date(
      Number(named[3]),
      month,
      Number(named[2]),
      to24h(Number(named[4]), named[7]),
      Number(named[5]),
      Number(named[6] ?? 0)
    )
  }

  // "2026-1-5@10h00m01s" (older "humanized" format)
  const humanized = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s*@\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s/)
  if (humanized) {
    return new Date(
      Number(humanized[1]),
      Number(humanized[2]) - 1,
      Number(humanized[3]),
      Number(humanized[4]),
      Number(humanized[5]),
      Number(humanized[6])
    )
  }

  // ISO, or "2026-01-05 10:00:01" (no zone => treated as local time)
  const normalized = /^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(' ', 'T') : s
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}
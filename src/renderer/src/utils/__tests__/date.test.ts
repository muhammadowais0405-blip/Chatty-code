import { describe, expect, it } from 'vitest'
import { parseSendDate } from '../date'

describe('parseSendDate', () => {
  it('parses epoch milliseconds and seconds', () => {
    expect(parseSendDate('1767607200000')?.getTime()).toBe(1767607200000)
    expect(parseSendDate('1767607200')?.getTime()).toBe(1767607200000)
  })

  it('parses "Month D, YYYY h:mmam"', () => {
    const d = parseSendDate('January 5, 2026 10:00am')!
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 0, 5, 10, 0
    ])
  })

  it('handles pm and the 12 o\'clock edge cases', () => {
    expect(parseSendDate('June 5, 2023 5:30pm')!.getHours()).toBe(17)
    expect(parseSendDate('June 5, 2023 12:15am')!.getHours()).toBe(0)
    expect(parseSendDate('June 5, 2023 12:15pm')!.getHours()).toBe(12)
  })

  it('parses the humanized "@10h00m01s" format', () => {
    const d = parseSendDate('2026-1-5@10h00m01s')!
    expect([d.getMonth(), d.getDate(), d.getHours(), d.getSeconds()]).toEqual([0, 5, 10, 1])
  })

  it('parses ISO and space-separated timestamps', () => {
    expect(parseSendDate('2026-01-05T10:00:01Z')).not.toBeNull()
    expect(parseSendDate('2026-01-05 10:00:01')!.getHours()).toBe(10)
  })

  it('returns null for empty or unparseable input', () => {
    expect(parseSendDate(null)).toBeNull()
    expect(parseSendDate('')).toBeNull()
    expect(parseSendDate('not a date')).toBeNull()
  })
})
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectFormat } from '../detectFormat'

function loadFixtureLines(name: string): unknown[] {
  const raw = readFileSync(join(__dirname, '../__fixtures__', name), 'utf-8')
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

describe('detectFormat', () => {
  it('detects sillytavern via header line', () => {
    const lines = loadFixtureLines('sillytavern.chat.jsonl')
    const result = detectFormat(lines)
    expect(result.format).toBe('sillytavern')
    expect(result.hasHeaderLine).toBe(true)
    expect(result.headerObj).toMatchObject({ character_name: 'Aria' })
  })

  it('detects sillytavern via mes key even without a header line', () => {
    const lines = [{ name: 'Aria', is_user: false, mes: 'hi', send_date: null, extra: {} }]
    const result = detectFormat(lines)
    expect(result.format).toBe('sillytavern')
    expect(result.hasHeaderLine).toBe(false)
  })

  it('detects flat_v1', () => {
    const lines = loadFixtureLines('flat_v1.chat.jsonl')
    const result = detectFormat(lines)
    expect(result.format).toBe('flat_v1')
    expect(result.hasHeaderLine).toBe(false)
  })

  it('detects marinara as a fallback shape', () => {
    const lines = loadFixtureLines('marinara.chat.jsonl')
    const result = detectFormat(lines)
    expect(result.format).toBe('marinara')
  })

  it('falls back to unknown for unrecognized shapes', () => {
    const lines = [{ foo: 'bar' }, { baz: 42 }]
    expect(detectFormat(lines).format).toBe('unknown')
  })

  it('returns unknown for an empty file', () => {
    expect(detectFormat([]).format).toBe('unknown')
  })
})

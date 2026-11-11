import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMessageWithMapping } from '../parseByFieldMapping'
import { DEFAULT_FIELD_MAPPINGS } from '../defaultFieldMappings'

function loadFixtureLines(name: string): unknown[] {
  const raw = readFileSync(join(__dirname, '../__fixtures__', name), 'utf-8')
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

describe('parseMessageWithMapping — sillytavern', () => {
  const [, ...messages] = loadFixtureLines('sillytavern.chat.jsonl')
  const mapping = DEFAULT_FIELD_MAPPINGS.sillytavern

  it('maps mes/is_user/name/send_date', () => {
    const parsed = parseMessageWithMapping(messages[0], mapping)
    expect(parsed).toMatchObject({
      text: "Hey Aria, how's it going?",
      senderName: 'You',
      isUser: 1,
      sendDate: '2026-01-05 10:00:01',
      unmapped: false
    })
  })

  it('resolves extra.image as an attachment', () => {
    const parsed = parseMessageWithMapping(messages[1], mapping)
    expect(parsed.attachmentRefs).toEqual(['attachments/aria-01.png'])
  })

  it('resolves extra.media[].url as multiple attachments', () => {
    const parsed = parseMessageWithMapping(messages[2], mapping)
    expect(parsed.attachmentRefs).toEqual(['attachments/aria-02.png', 'attachments/aria-03.png'])
  })
})

describe('parseMessageWithMapping — marinara (unverified/fallback shape)', () => {
  const messages = loadFixtureLines('marinara.chat.jsonl')
  const mapping = DEFAULT_FIELD_MAPPINGS.marinara

  it('tries textFields in order, first non-empty wins', () => {
    expect(parseMessageWithMapping(messages[0], mapping).text).toBe('morning')
    // third line has no "text", only "content" — falls through to it
    expect(parseMessageWithMapping(messages[2], mapping).text).toBe('(fallback content field)')
  })

  it('resolves attachments[] as a flat list', () => {
    expect(parseMessageWithMapping(messages[1], mapping).attachmentRefs).toEqual([
      'attachments/rin-gift.webp'
    ])
  })
})

describe('parseMessageWithMapping — flat_v1', () => {
  const messages = loadFixtureLines('flat_v1.chat.jsonl')
  const mapping = DEFAULT_FIELD_MAPPINGS.flat_v1

  it('maps role through roleUserValue/roleAssistantValue/roleSystemValue', () => {
    expect(parseMessageWithMapping(messages[0], mapping).isUser).toBe(2) // system
    expect(parseMessageWithMapping(messages[1], mapping).isUser).toBe(1) // user
    expect(parseMessageWithMapping(messages[2], mapping).isUser).toBe(0) // assistant
  })

  it('resolves time -> sendDate and text -> text', () => {
    const parsed = parseMessageWithMapping(messages[1], mapping)
    expect(parsed.sendDate).toBe('2026-01-07T09:00:05Z')
    expect(parsed.text).toBe('nice view up here')
  })
})

describe('parseMessageWithMapping — edge cases', () => {
  it('flags unmapped when no textFields resolve', () => {
    const parsed = parseMessageWithMapping({ foo: 'bar' }, DEFAULT_FIELD_MAPPINGS.sillytavern)
    expect(parsed.unmapped).toBe(true)
    expect(parsed.text).toBeNull()
  })

  it('handles non-object messages gracefully', () => {
    const parsed = parseMessageWithMapping('not an object', DEFAULT_FIELD_MAPPINGS.flat_v1)
    expect(parsed.unmapped).toBe(true)
  })

  it('treats is_system + extra.type as a system message, but not hidden messages', () => {
    const st = DEFAULT_FIELD_MAPPINGS.sillytavern
    const narrator = { name: 'Narrator', is_user: false, is_system: true, mes: 'x', extra: { type: 'narrator' } }
    const hidden = { name: 'Aria', is_user: false, is_system: true, mes: 'x', extra: {} }
    expect(parseMessageWithMapping(narrator, st).isUser).toBe(2)
    expect(parseMessageWithMapping(hidden, st).isUser).toBe(0)
  })
})
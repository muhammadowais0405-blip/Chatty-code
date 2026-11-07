import { describe, expect, it } from 'vitest'
import { resolveAttachmentPaths } from '../attachmentPath'

describe('resolveAttachmentPaths', () => {
  it('resolves a bare array-of-strings path', () => {
    const obj = { attachments: ['a.png', 'b.png'] }
    expect(resolveAttachmentPaths(obj, ['attachments[]'])).toEqual(['a.png', 'b.png'])
  })

  it('resolves foo.bar[].baz across an array of objects', () => {
    const obj = { extra: { media: [{ url: 'a.png' }, { url: 'b.png' }] } }
    expect(resolveAttachmentPaths(obj, ['extra.media[].url'])).toEqual(['a.png', 'b.png'])
  })

  it('resolves a plain nested field', () => {
    const obj = { extra: { image: 'a.png' } }
    expect(resolveAttachmentPaths(obj, ['extra.image'])).toEqual(['a.png'])
  })

  it('skips missing/malformed paths without throwing', () => {
    const obj = { extra: {} }
    expect(resolveAttachmentPaths(obj, ['extra.image', 'extra.media[].url'])).toEqual([])
  })

  it('combines multiple path specs', () => {
    const obj = { extra: { image: 'a.png', files: [{ url: 'b.png' }] } }
    expect(resolveAttachmentPaths(obj, ['extra.image', 'extra.files[].url'])).toEqual([
      'a.png',
      'b.png'
    ])
  })
})

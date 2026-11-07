import type { FieldMappingTestInput, FieldMappingTestResult } from '@shared/types'
import { detectFormat } from './detectFormat'
import { parseMessageWithMapping } from './parseByFieldMapping'
import { readJsonLines } from './importChat'

const PREVIEW_LIMIT = 50

export function testFieldMapping(input: FieldMappingTestInput): FieldMappingTestResult {
  const lines = readJsonLines(input.sourcePath)
  const detected = detectFormat(lines)
  const messageLines = detected.hasHeaderLine ? lines.slice(1) : lines

  const rows = messageLines.slice(0, PREVIEW_LIMIT).map((line, seq) => {
    const parsed = parseMessageWithMapping(line, input.mapping)
    return {
      seq,
      senderName: parsed.senderName,
      isUser: parsed.isUser,
      text: parsed.text,
      attachmentCount: parsed.attachmentRefs.length,
      unmapped: parsed.unmapped
    }
  })

  return {
    detectedFormat: detected.format,
    hasHeaderLine: detected.hasHeaderLine,
    totalLines: messageLines.length,
    rows
  }
}

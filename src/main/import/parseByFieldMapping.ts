import type { FieldMappingEntry } from '@shared/types'
import { resolveAttachmentPaths } from './attachmentPath'

export interface ParsedMessageFields {
  text: string | null
  senderName: string | null
  /** 0 = character/assistant, 1 = user, 2 = system (matches messages.is_user) */
  isUser: 0 | 1 | 2
  sendDate: string | null
  attachmentRefs: string[]
  /** True if none of textFields resolved to a non-empty value — surfaced
   *  as ImportResult.unmappedFieldWarning so the UI can point at Settings. */
  unmapped: boolean
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function coerceString(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v
  if (typeof v === 'number') return String(v)
  return null
}

export function parseMessageWithMapping(
  message: unknown,
  mapping: FieldMappingEntry
): ParsedMessageFields {
  if (!isObj(message)) {
    return { text: null, senderName: null, isUser: 0, sendDate: null, attachmentRefs: [], unmapped: true }
  }

  // textFields: try in order, first non-empty wins (§4.2).
  let text: string | null = null
  for (const field of mapping.textFields) {
    const candidate = coerceString(message[field])
    if (candidate !== null) {
      text = candidate
      break
    }
  }

  const senderName = coerceString(message[mapping.senderNameField])

  // isUserField boolean OR roleField mapped through role*Value (§4.2).
  let isUser: 0 | 1 | 2 = 0
  if (mapping.isUserField) {
    isUser = message[mapping.isUserField] ? 1 : 0
  } else if (mapping.roleField) {
    const role = message[mapping.roleField]
    if (role === mapping.roleUserValue) isUser = 1
    else if (role === mapping.roleSystemValue) isUser = 2
    else if (role === mapping.roleAssistantValue) isUser = 0
  }

    // SillyTavern narrator / system / comment messages: is_system plus an extra.type.
  // (Hidden messages also set is_system but have no extra.type, so they stay normal.)
  const extra = message['extra']
  if (message['is_system'] === true && isObj(extra) && typeof extra['type'] === 'string') {
    isUser = 2
  }
  const sendDate = coerceString(message[mapping.dateField])
  const attachmentRefs = resolveAttachmentPaths(message, mapping.attachmentPaths)

  return {
    text,
    senderName,
    isUser,
    sendDate,
    attachmentRefs,
    unmapped: text === null
  }
}

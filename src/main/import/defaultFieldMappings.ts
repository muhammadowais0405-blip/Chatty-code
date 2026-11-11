import type { FieldMappingsConfig } from '@shared/types'

// Verbatim from build-spec §4.2.
export const DEFAULT_FIELD_MAPPINGS: FieldMappingsConfig = {
  sillytavern: {
    textFields: ['mes'],
    senderNameField: 'name',
    isUserField: 'is_user',
    dateField: 'send_date',
    attachmentPaths: ['extra.image', 'extra.media[].url', 'extra.files[].url', 'extra.file.url']
  },
  marinara: {
    textFields: ['mes', 'text', 'content', 'message'],
    senderNameField: 'name',
    isUserField: 'is_user',
    dateField: 'send_date',
    attachmentPaths: ['attachments[]', 'files[].url']
  },
  flat_v1: {
    textFields: ['text'],
    senderNameField: 'name',
    isUserField: null,
    roleField: 'role',
    roleUserValue: 'user',
    roleAssistantValue: 'assistant',
    roleSystemValue: 'system',
    dateField: 'time',
    attachmentPaths: ['attachments[]']
  }
}

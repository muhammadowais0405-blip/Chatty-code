// Types mirror the DDL in build-spec §2 (plus the folders.is_trashed /
// trashed_at correction from §6). Kept in `shared` so both main and
// renderer get the same shapes without duplicating them.

export type SourceFormat = 'sillytavern' | 'marinara' | 'flat_v1' | 'unknown'

export interface Folder {
  id: number
  parent_id: number | null
  name: string
  position: number
  color: string | null
  icon: string | null
  is_system: 0 | 1
  is_trashed: 0 | 1
  trashed_at: string | null
  created_at: string
  updated_at: string
  /** Computed, not persisted: count of directly-contained non-trashed
   *  chats. Populated by folders:list to back the sidebar's "Sort by
   *  Message Count" option (§6) without a separate round trip. */
  chatCount?: number
}

export interface Chat {
  id: number
  folder_id: number | null
  title: string
  source_format: SourceFormat
  character_name: string | null
  user_name: string | null
  message_count: number
  attachment_count: number
  chat_metadata: string | null
  original_source_path: string | null
  imported_at: string
  is_trashed: 0 | 1
  trashed_at: string | null
}

/** Lighter-weight row used for chat list cards (§7). */
export interface ChatSummary
  extends Pick<
    Chat,
    | 'id'
    | 'folder_id'
    | 'title'
    | 'character_name'
    | 'message_count'
    | 'attachment_count'
    | 'imported_at'
    | 'is_trashed'
  > {
  /** id of the first image attachment in the chat, or null. */
  thumbnailAttachmentId: number | null
  /** GROUP_CONCAT of "id|name|color" for each assigned tag, comma-separated.
   *  Parse with parseChatTagSummary(). Null if no tags. */
  tagSummary: string | null
}

export interface Message {
  id: number
  chat_id: number
  seq: number
  sender_name: string | null
  is_user: 0 | 1 | 2
  send_date: string | null
  text: string | null
  raw_json: string
}

export interface Attachment {
  id: number
  message_id: number
  label: string | null
  original_ref: string | null
  stored_path: string
  mime_type: string | null
  link_mode: 0 | 1
  missing: 0 | 1
}

export interface Tag {
  id: number
  name: string
  color: string | null
}

// ---- IPC request/response payloads (§5) ----

export interface CreateFolderInput {
  parentId: number | null
  name: string
}

export interface RenameFolderInput {
  id: number
  name: string
}

export interface MoveFolderInput {
  id: number
  newParentId: number | null
  newPosition: number
}

export interface ReorderFoldersInput {
  parentId: number | null
  orderedIds: number[]
}

export interface SetFolderColorInput {
  id: number
  color: string | null
}

export interface SetFolderIconInput {
  id: number
  icon: string | null
}

export type FolderView = number | 'all' | 'trash'

export interface ChatDetail {
  chat: Chat
  messages: Message[]
  attachments: Attachment[]
}

export interface MoveChatInput {
  chatId: number
  targetFolderId: number | null
}

export interface RenameChatInput {
  chatId: number
  title: string
}

export interface ImportStartInput {
  sourcePath: string
  targetFolderId: number | null
  linkMode: boolean
  /** Optional: path to the SillyTavern installation root. Needed when
   *  attachment refs are server-relative paths like /user/images/...  */
  sillytavernBasePath?: string | null
  /** Set true to import anyway after the user was warned about a
   *  likely-duplicate chat (title + character + message count match). */
  forceDuplicate?: boolean
}

export interface ImportResult {
  chatId: number
  messageCount: number
  attachmentCount: number
  missingCount: number
  unmappedFieldWarning: boolean
  /** Diagnostics to make "why are my attachments missing" debuggable
   *  without spelunking the filesystem by hand. */
  detectedFormat: SourceFormat
  /** First few missing attachments: the raw ref from the JSON and the
   *  absolute path we actually checked on disk for it. */
  sampleMissingAttachments: { ref: string; checkedPath: string }[]
  /** False when a likely duplicate was found and forceDuplicate wasn't
   *  set — nothing was written to the DB, see duplicateOf. */
  imported: boolean
  duplicateOf: { chatId: number; title: string } | null
}

export interface ImportProgress {
  phase: 'reading' | 'parsing' | 'attachments' | 'done'
  current: number
  total: number
}

export interface BackupExportInput {
  destPath: string
  /** 'all' exports every non-trashed chat; {folderIds} exports chats in those folders only
   *  (pass null in the array to include root-level chats). */
  scope: 'all' | { folderIds: (number | null)[] }
  /** Copy link-mode attachment files into the zip (default false). */
  includeLinkMode: boolean
    /** Filename prefix. Auto-backups use "auto-backup" so pruning never touches manual ones. */
  filePrefix?: string
}

export interface BackupExportResult {
  path: string
  chatCount: number
  fileCount: number
}

export type MergeStrategy = 'skip' | 'duplicate' | 'replace'

export interface BackupRestoreInput {
  sourcePath: string
  mergeStrategy: MergeStrategy
}

export interface RestoreResult {
  chatsImported: number
  chatsSkipped: number
  chatsReplaced: number
  foldersCreated: number
  tagsRestored: number
  promptsImported: number
}

/** Returned by backup:check — lets the UI show a preview before committing to restore. */
export interface BackupCheckResult {
  valid: boolean
  error?: string
  manifest: {
    version: number
    exportedAt: string
    chatCount: number
    fileCount: number
    hasPrompts: boolean
    hasTags: boolean
  } | null
  /** First few chat titles in the backup for preview. */
  previewTitles: string[]
}

export interface AutoBackupSettings {
  enabled: boolean
  /** How often to run, in hours. 24 = daily, 168 = weekly. */
  intervalHours: number
  /** Keep only this many backups in the folder (0 = keep all). */
  keepCount: number
  lastRunAt: string | null
}

// ---- Prompts (sets of ordered, named, role-tagged blocks — mirrors a
// SillyTavern Chat Completion preset's Prompt Manager) ----

export interface PromptSet {
  id: number
  name: string
  created_at: string
  updated_at: string
}

export type PromptRole = 'system' | 'user' | 'assistant'

export interface PromptBlock {
  id: number
  set_id: number
  name: string
  role: PromptRole
  content: string
  enabled: 0 | 1
  position: number
  created_at: string
  updated_at: string
}

export interface CreatePromptSetInput {
  name: string
}

export interface RenamePromptSetInput {
  id: number
  name: string
}

export interface CreatePromptBlockInput {
  setId: number
  name: string
  role: PromptRole
  content: string
}

export interface UpdatePromptBlockInput {
  id: number
  name: string
  role: PromptRole
  content: string
}

export interface ReorderPromptBlocksInput {
  setId: number
  orderedIds: number[]
}

export interface SetPromptBlockEnabledInput {
  id: number
  enabled: boolean
}

export interface FieldMappingEntry {
  textFields: string[]
  senderNameField: string
  isUserField: string | null
  roleField?: string
  roleUserValue?: string
  roleAssistantValue?: string
  roleSystemValue?: string
  dateField: string
  attachmentPaths: string[]
}

export interface FieldMappingsConfig {
  sillytavern: FieldMappingEntry
  marinara: FieldMappingEntry
  flat_v1: FieldMappingEntry
}

export interface Settings {
  fieldMappings: FieldMappingsConfig
  defaultBackupFolder: string | null
  linkModeDefault: boolean
  sillytavernBasePath: string | null
  autoBackup: AutoBackupSettings
}

export interface RelinkAttachmentsInput {
  chatId: number
  folderPath: string
}

export interface RelinkAttachmentsResult {
  relinked: number
  stillMissing: number
}

export interface FieldMappingTestInput {
  sourcePath: string
  format: SourceFormat
  mapping: FieldMappingEntry
}

export interface FieldMappingPreviewRow {
  seq: number
  senderName: string | null
  isUser: 0 | 1 | 2
  text: string | null
  attachmentCount: number
  unmapped: boolean
}

export interface FieldMappingTestResult {
  detectedFormat: SourceFormat
  hasHeaderLine: boolean
  totalLines: number
  rows: FieldMappingPreviewRow[]
}

// ---- Library stats ----

export interface LibraryStats {
  totalChats: number
  totalMessages: number
  totalAttachments: number
  totalFolders: number
  totalTags: number
  trashedCount: number
  topCharacters: { name: string; chatCount: number; messageCount: number }[]
  /** Chronological, oldest first, up to the last 12 calendar months with imports. */
  importsByMonth: { month: string; count: number }[]
}

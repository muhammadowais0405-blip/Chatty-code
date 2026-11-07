import { dialog, ipcMain } from 'electron'
import { rmSync } from 'node:fs'
import { IPC } from '@shared/ipc-channels'
import { getDb } from '../db'
import { loadSettings, saveSettings } from '../settings'
import { importChat } from '../import/importChat'
import { testFieldMapping } from '../import/testFieldMapping'
import { attachmentsRootForChat } from '../import/resolveWorkingDir'
import {
  createFolder,
  deleteFolder,
  listFolders,
  moveFolder,
  renameFolder,
  reorderFolders,
  setFolderColor,
  setFolderIcon
} from '../folders/foldersRepo'
import {
  deleteChatRow,
  getChatDetail,
  listChatsByFolder,
  moveChat,
  renameChat,
  restoreChat,
  searchChats,
  trashChat
} from '../chats/chatsRepo'
import { relinkAttachments } from '../chats/relinkAttachments'
import { exportBackup } from '../backup/backupExport'
import { checkBackup, restoreBackup } from '../backup/backupRestore'
import { restartAutoBackup } from '../backup/autoBackup'
import {
  createPromptBlock,
  createPromptSet,
  deletePromptBlock,
  deletePromptSet,
  listPromptBlocks,
  listPromptSets,
  renamePromptSet,
  reorderPromptBlocks,
  setPromptBlockEnabled,
  updatePromptBlock
} from '../prompts/promptSetsRepo'
import {
  assignTag,
  createTag,
  deleteTag,
  listTags,
  listTagsForChat,
  renameTag,
  setTagColor,
  unassignTag
} from '../tags/tagsRepo'
import { listChatsByTag } from '../chats/chatsRepo'
import { computeLibraryStats } from '../stats/statsRepo'
import type {
  BackupCheckResult,
  BackupExportInput,
  BackupExportResult,
  BackupRestoreInput,
  ChatDetail,
  ChatSummary,
  CreateFolderInput,
  CreatePromptBlockInput,
  CreatePromptSetInput,
  FieldMappingTestInput,
  FieldMappingTestResult,
  Folder,
  FolderView,
  ImportResult,
  ImportStartInput,
  LibraryStats,
  MoveChatInput,
  MoveFolderInput,
  PromptBlock,
  PromptSet,
  RenameChatInput,
  RenameFolderInput,
  RenamePromptSetInput,
  RelinkAttachmentsInput,
  RelinkAttachmentsResult,
  ReorderFoldersInput,
  ReorderPromptBlocksInput,
  RestoreResult,
  Settings,
  SetFolderColorInput,
  SetFolderIconInput,
  SetPromptBlockEnabledInput,
  Tag,
  UpdatePromptBlockInput
} from '@shared/types'

export function registerIpcHandlers(): void {
  // ---- folders (Phase 3 — full CRUD) ----
  ipcMain.handle(IPC.foldersList, (): Folder[] => listFolders(getDb()))
  ipcMain.handle(IPC.foldersCreate, (_event, input: CreateFolderInput): Folder =>
    createFolder(getDb(), input)
  )
  ipcMain.handle(IPC.foldersRename, (_event, input: RenameFolderInput): Folder =>
    renameFolder(getDb(), input)
  )
  ipcMain.handle(IPC.foldersMove, (_event, input: MoveFolderInput): void =>
    moveFolder(getDb(), input)
  )
  ipcMain.handle(IPC.foldersReorder, (_event, input: ReorderFoldersInput): void =>
    reorderFolders(getDb(), input)
  )
  ipcMain.handle(IPC.foldersSetColor, (_event, input: SetFolderColorInput): Folder =>
    setFolderColor(getDb(), input)
  )
  ipcMain.handle(IPC.foldersSetIcon, (_event, input: SetFolderIconInput): Folder =>
    setFolderIcon(getDb(), input)
  )
  ipcMain.handle(IPC.foldersDelete, (_event, { id }: { id: number }): void =>
    deleteFolder(getDb(), id)
  )

  // ---- chats (Phase 4 real; Phase 5 trash lifecycle still stubbed) ----
  ipcMain.handle(IPC.chatsListByFolder, (_event, { folderId }: { folderId: FolderView }): ChatSummary[] =>
    listChatsByFolder(getDb(), folderId)
  )
  ipcMain.handle(IPC.chatsGet, (_event, { chatId }: { chatId: number }): ChatDetail =>
    getChatDetail(getDb(), chatId)
  )
  ipcMain.handle(IPC.chatsMove, (_event, input: MoveChatInput): void => moveChat(getDb(), input))
  ipcMain.handle(IPC.chatsRename, (_event, input: RenameChatInput): void =>
    renameChat(getDb(), input)
  )
  ipcMain.handle(IPC.chatsSearch, (_event, { query }: { query: string }): ChatSummary[] =>
    searchChats(getDb(), query)
  )
  ipcMain.handle(IPC.chatsTrash, (_event, { chatId }: { chatId: number }): void =>
    trashChat(getDb(), chatId)
  )
  ipcMain.handle(IPC.chatsRestore, (_event, { chatId }: { chatId: number }): void =>
    restoreChat(getDb(), chatId)
  )
  ipcMain.handle(IPC.chatsDeletePermanent, (_event, { chatId }: { chatId: number }): void => {
    deleteChatRow(getDb(), chatId) // cascades to messages/attachments via FK
    rmSync(attachmentsRootForChat(chatId), { recursive: true, force: true })
  })

  ipcMain.handle(
    IPC.chatsRelinkAttachments,
    (_event, input: RelinkAttachmentsInput): RelinkAttachmentsResult =>
      relinkAttachments(getDb(), input)
  )

  // ---- import (Phase 2) ----
  ipcMain.handle(IPC.importStart, (event, input: ImportStartInput): ImportResult => {
    const db = getDb()
    return importChat(db, input, (progress) => {
      event.sender.send(IPC.importProgress, progress)
    })
  })

  ipcMain.handle(IPC.dialogSelectImportSource, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Select a chat export',
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: 'Chat files (.jsonl, .zip)', extensions: ['jsonl', 'zip'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.dialogSelectSampleFile, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Select a sample chat.jsonl to test against',
      properties: ['openFile'],
      filters: [
        { name: 'Chat export', extensions: ['jsonl', 'txt'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.dialogSelectFolder, async (_event, title?: string): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: title ?? 'Select a folder',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.dialogSelectBackupDest, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Choose backup destination folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(
    IPC.settingsTestFieldMapping,
    (_event, input: FieldMappingTestInput): FieldMappingTestResult => testFieldMapping(input)
  )

  // ---- backup (Phase 6 + improvements) ----
  ipcMain.handle(IPC.backupExport, (_event, input: BackupExportInput): Promise<BackupExportResult> =>
    exportBackup(getDb(), input)
  )
  ipcMain.handle(IPC.backupRestore, (_event, input: BackupRestoreInput): RestoreResult =>
    restoreBackup(getDb(), input)
  )
  ipcMain.handle(IPC.backupCheck, (_event, sourcePath: string): BackupCheckResult =>
    checkBackup(sourcePath)
  )

  // ---- prompt sets ----
  ipcMain.handle(IPC.promptSetsList, (): PromptSet[] => listPromptSets(getDb()))
  ipcMain.handle(IPC.promptSetsCreate, (_event, input: CreatePromptSetInput): PromptSet =>
    createPromptSet(getDb(), input)
  )
  ipcMain.handle(IPC.promptSetsRename, (_event, input: RenamePromptSetInput): PromptSet =>
    renamePromptSet(getDb(), input)
  )
  ipcMain.handle(IPC.promptSetsDelete, (_event, { id }: { id: number }): void =>
    deletePromptSet(getDb(), id)
  )

  // ---- prompt blocks ----
  ipcMain.handle(IPC.promptBlocksList, (_event, { setId }: { setId: number }): PromptBlock[] =>
    listPromptBlocks(getDb(), setId)
  )
  ipcMain.handle(IPC.promptBlocksCreate, (_event, input: CreatePromptBlockInput): PromptBlock =>
    createPromptBlock(getDb(), input)
  )
  ipcMain.handle(IPC.promptBlocksUpdate, (_event, input: UpdatePromptBlockInput): PromptBlock =>
    updatePromptBlock(getDb(), input)
  )
  ipcMain.handle(IPC.promptBlocksDelete, (_event, { id }: { id: number }): void =>
    deletePromptBlock(getDb(), id)
  )
  ipcMain.handle(IPC.promptBlocksReorder, (_event, input: ReorderPromptBlocksInput): void =>
    reorderPromptBlocks(getDb(), input)
  )
  ipcMain.handle(IPC.promptBlocksSetEnabled, (_event, input: SetPromptBlockEnabledInput): PromptBlock =>
    setPromptBlockEnabled(getDb(), input)
  )

  ipcMain.handle(IPC.chatsListByTag, (_event, { tagId }: { tagId: number }): ChatSummary[] =>
    listChatsByTag(getDb(), tagId)
  )

  // ---- tags (Phase 7) ----
  ipcMain.handle(IPC.tagsList, (): Tag[] => listTags(getDb()))
  ipcMain.handle(IPC.tagsCreate, (_event, { name, color }: { name: string; color: string | null }): Tag =>
    createTag(getDb(), name, color)
  )
  ipcMain.handle(IPC.tagsRename, (_event, { id, name }: { id: number; name: string }): Tag =>
    renameTag(getDb(), id, name)
  )
  ipcMain.handle(IPC.tagsSetColor, (_event, { id, color }: { id: number; color: string | null }): Tag =>
    setTagColor(getDb(), id, color)
  )
  ipcMain.handle(IPC.tagsDelete, (_event, { id }: { id: number }): void =>
    deleteTag(getDb(), id)
  )
  ipcMain.handle(IPC.tagsAssign, (_event, { chatId, tagId }: { chatId: number; tagId: number }): void =>
    assignTag(getDb(), chatId, tagId)
  )
  ipcMain.handle(IPC.tagsUnassign, (_event, { chatId, tagId }: { chatId: number; tagId: number }): void =>
    unassignTag(getDb(), chatId, tagId)
  )
  ipcMain.handle(IPC.tagsListForChat, (_event, { chatId }: { chatId: number }): Tag[] =>
    listTagsForChat(getDb(), chatId)
  )

  // ---- settings (real from Phase 1 — trivial JSON read/write) ----
  ipcMain.handle(IPC.settingsGet, (): Settings => loadSettings())
  ipcMain.handle(IPC.settingsSet, (_event, next: Settings): Settings => {
    const saved = saveSettings(next)
    restartAutoBackup(getDb(), saved)
    return saved
  })

  // ---- stats ----
  ipcMain.handle(IPC.statsGet, (): LibraryStats => computeLibraryStats(getDb()))
}

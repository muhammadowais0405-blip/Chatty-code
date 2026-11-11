import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
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
  ImportProgress,
  ImportResult,
  ImportStartInput,
  LibraryStats,
  MoveChatInput,
  MoveFolderInput,
  PromptBlock,
  PromptSet,
  RelinkAttachmentsInput,
  RelinkAttachmentsResult,
  RenameChatInput,
  RenameFolderInput,
  RenamePromptSetInput,
  ReorderFoldersInput,
  ReorderPromptBlocksInput,
  RestoreResult,
  SetFolderColorInput,
  SetFolderIconInput,
  SetPromptBlockEnabledInput,
  Settings,
  Tag,
  UpdatePromptBlockInput
} from '@shared/types'

const api = {
  folders: {
    list: (): Promise<Folder[]> => ipcRenderer.invoke(IPC.foldersList),
    create: (input: CreateFolderInput): Promise<Folder> => ipcRenderer.invoke(IPC.foldersCreate, input),
    rename: (input: RenameFolderInput): Promise<Folder> => ipcRenderer.invoke(IPC.foldersRename, input),
    move: (input: MoveFolderInput): Promise<void> => ipcRenderer.invoke(IPC.foldersMove, input),
    reorder: (input: ReorderFoldersInput): Promise<void> => ipcRenderer.invoke(IPC.foldersReorder, input),
    setColor: (input: SetFolderColorInput): Promise<Folder> => ipcRenderer.invoke(IPC.foldersSetColor, input),
    setIcon: (input: SetFolderIconInput): Promise<Folder> => ipcRenderer.invoke(IPC.foldersSetIcon, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke(IPC.foldersDelete, { id })
  },
  chats: {
    listByFolder: (view: FolderView): Promise<ChatSummary[]> =>
      ipcRenderer.invoke(IPC.chatsListByFolder, { folderId: view }),
    listByTag: (tagId: number): Promise<ChatSummary[]> =>
      ipcRenderer.invoke(IPC.chatsListByTag, { tagId }),
    get: (chatId: number): Promise<ChatDetail> => ipcRenderer.invoke(IPC.chatsGet, { chatId }),
    move: (input: MoveChatInput): Promise<void> => ipcRenderer.invoke(IPC.chatsMove, input),
    rename: (input: RenameChatInput): Promise<void> => ipcRenderer.invoke(IPC.chatsRename, input),
    trash: (chatId: number): Promise<void> => ipcRenderer.invoke(IPC.chatsTrash, { chatId }),
    restore: (chatId: number): Promise<void> => ipcRenderer.invoke(IPC.chatsRestore, { chatId }),
    deletePermanent: (chatId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.chatsDeletePermanent, { chatId }),
    search: (query: string): Promise<ChatSummary[]> => ipcRenderer.invoke(IPC.chatsSearch, { query }),
    relinkAttachments: (input: RelinkAttachmentsInput): Promise<RelinkAttachmentsResult> =>
      ipcRenderer.invoke(IPC.chatsRelinkAttachments, input)
  },
  import: {
    start: (input: ImportStartInput): Promise<ImportResult> => ipcRenderer.invoke(IPC.importStart, input),
    onProgress: (callback: (progress: ImportProgress) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, p: ImportProgress) => callback(p)
      ipcRenderer.on(IPC.importProgress, listener)
      return () => ipcRenderer.removeListener(IPC.importProgress, listener)
    }
  },
  backup: {
    export: (input: BackupExportInput): Promise<BackupExportResult> =>
      ipcRenderer.invoke(IPC.backupExport, input),
    restore: (input: BackupRestoreInput): Promise<RestoreResult> =>
      ipcRenderer.invoke(IPC.backupRestore, input),
    check: (sourcePath: string): Promise<BackupCheckResult> =>
      ipcRenderer.invoke(IPC.backupCheck, sourcePath)
  },
  tags: {
    list: (): Promise<Tag[]> => ipcRenderer.invoke(IPC.tagsList),
    create: (name: string, color: string | null): Promise<Tag> =>
      ipcRenderer.invoke(IPC.tagsCreate, { name, color }),
    rename: (id: number, name: string): Promise<Tag> =>
      ipcRenderer.invoke(IPC.tagsRename, { id, name }),
    setColor: (id: number, color: string | null): Promise<Tag> =>
      ipcRenderer.invoke(IPC.tagsSetColor, { id, color }),
    delete: (id: number): Promise<void> => ipcRenderer.invoke(IPC.tagsDelete, { id }),
    assign: (chatId: number, tagId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.tagsAssign, { chatId, tagId }),
        unassign: (chatId: number, tagId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.tagsUnassign, { chatId, tagId })
  },
  promptSets: {
    list: (): Promise<PromptSet[]> => ipcRenderer.invoke(IPC.promptSetsList),
    create: (input: CreatePromptSetInput): Promise<PromptSet> =>
      ipcRenderer.invoke(IPC.promptSetsCreate, input),
    rename: (input: RenamePromptSetInput): Promise<PromptSet> =>
      ipcRenderer.invoke(IPC.promptSetsRename, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke(IPC.promptSetsDelete, { id })
  },
  promptBlocks: {
    list: (setId: number): Promise<PromptBlock[]> =>
      ipcRenderer.invoke(IPC.promptBlocksList, { setId }),
    create: (input: CreatePromptBlockInput): Promise<PromptBlock> =>
      ipcRenderer.invoke(IPC.promptBlocksCreate, input),
    update: (input: UpdatePromptBlockInput): Promise<PromptBlock> =>
      ipcRenderer.invoke(IPC.promptBlocksUpdate, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke(IPC.promptBlocksDelete, { id }),
    reorder: (input: ReorderPromptBlocksInput): Promise<void> =>
      ipcRenderer.invoke(IPC.promptBlocksReorder, input),
    setEnabled: (input: SetPromptBlockEnabledInput): Promise<PromptBlock> =>
      ipcRenderer.invoke(IPC.promptBlocksSetEnabled, input)
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet),
    set: (next: Settings): Promise<Settings> => ipcRenderer.invoke(IPC.settingsSet, next)
  },
  dialog: {
    selectImportSource: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialogSelectImportSource),
    selectSampleFile: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialogSelectSampleFile),
    selectFolder: (title?: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialogSelectFolder, title),
        selectBackupDest: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialogSelectBackupDest),
    selectBackupFile: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialogSelectBackupFile)
  },
  fieldMappings: {
    test: (input: FieldMappingTestInput): Promise<FieldMappingTestResult> =>
      ipcRenderer.invoke(IPC.settingsTestFieldMapping, input)
  },
  stats: {
    get: (): Promise<LibraryStats> => ipcRenderer.invoke(IPC.statsGet)
  }
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)

export const IPC = {
  foldersList: 'folders:list',
  foldersCreate: 'folders:create',
  foldersRename: 'folders:rename',
  foldersMove: 'folders:move',
  foldersReorder: 'folders:reorder',
  foldersSetColor: 'folders:setColor',
  foldersSetIcon: 'folders:setIcon',
  foldersDelete: 'folders:delete',

  chatsListByFolder: 'chats:listByFolder',
  chatsListByTag: 'chats:listByTag',
  chatsGet: 'chats:get',
  chatsMove: 'chats:move',
  chatsRename: 'chats:rename',
  chatsTrash: 'chats:trash',
  chatsRestore: 'chats:restore',
  chatsDeletePermanent: 'chats:deletePermanent',
  chatsSearch: 'chats:search',
  chatsRelinkAttachments: 'chats:relinkAttachments',

  importStart: 'import:start',
  importProgress: 'import:progress',

  backupExport: 'backup:export',
  backupRestore: 'backup:restore',
  backupCheck: 'backup:check',

  tagsList: 'tags:list',
  tagsCreate: 'tags:create',
  tagsRename: 'tags:rename',
  tagsSetColor: 'tags:setColor',
  tagsDelete: 'tags:delete',
  tagsAssign: 'tags:assign',
  tagsUnassign: 'tags:unassign',
  tagsListForChat: 'tags:listForChat',

  promptSetsList: 'promptSets:list',
  promptSetsCreate: 'promptSets:create',
  promptSetsRename: 'promptSets:rename',
  promptSetsDelete: 'promptSets:delete',

  promptBlocksList: 'promptBlocks:list',
  promptBlocksCreate: 'promptBlocks:create',
  promptBlocksUpdate: 'promptBlocks:update',
  promptBlocksDelete: 'promptBlocks:delete',
  promptBlocksReorder: 'promptBlocks:reorder',
  promptBlocksSetEnabled: 'promptBlocks:setEnabled',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  statsGet: 'stats:get',

  dialogSelectImportSource: 'dialog:selectImportSource',
  dialogSelectSampleFile: 'dialog:selectSampleFile',
  dialogSelectFolder: 'dialog:selectFolder',
  dialogSelectBackupDest: 'dialog:selectBackupDest',
  settingsTestFieldMapping: 'settings:testFieldMapping'
} as const

I went through every file you attached. This is a static read, not a run of the app, so I’ve marked the few things I’d want to verify. The app is called “Chat Archiver” in the code, so I’ll say Chatty where it matters.

The biggest findings:

Windows breaks on file selection. On Windows, the Import and Restore pickers can’t select files at all.
Heavy work freezes the app. It all runs synchronously on the main thread.
Several paths can lose data. Backup pruning, restore, attachment naming and bulk selection can all destroy or mangle data.
There’s drift. Dead settings, duplicated helpers and stale comments have piled up.
Phase 0: safety net (before any edits)
Tag the current state as v1.0-legacy in git and zip your real userData folder. The 2.0 migrations will change the schema, and the app should also copy library.db to library.v1.bak before migrating.
Add ESLint and Prettier. The code has eslint-disable comments but neither is installed. Add knip too, to confirm the dead-code list below mechanically.
Decide the rename to Chatty now. Pin the app name and userData path explicitly and migrate the old folder. Dev and packaged builds may already use different data directories (verify), and a rename would silently orphan users’ libraries.
Phase 1: delete or consolidate
What	Why
Migrations 003 and 004	Create prompts, then migrate and drop it. Squash into a 2.0 baseline and keep an upgrade path from 1.x.
folders.is_system	Never set, only skipped in restore.
Settings.linkModeDefault	Never read. ImportDialog hardcodes false. I’d wire it up rather than delete it.
LibraryStats.totalPrompts	Computed and tested, never displayed.
ImportProgress 'error' phase and message	Never emitted.
renameChat’s manual UPDATE chats_fts	The chats_au trigger already does this, and poking an external-content FTS table directly is fragile.
hasFts5() and the LIKE fallback	Migration 002 always creates FTS.
tags.listForChat IPC	The renderer never calls it, as far as I can see.
Re-exports getFolderIcon (Sidebar.tsx) and DEFAULT_FIELD_MAPPINGS (settings.ts)	Nobody imports them through those paths.
Duplicates: Field, selectStyle, inputStyle and PathRow (3 copies), isObj (2), attachment disk-path resolution (serveAttachment and backupExport), and the FOLDER_COLORS/TAG_COLORS palettes	Move into a shared UI kit and utils.
README (“Phase 1, stubs”) and stale comments (“Phase 5 still stubbed”)	Rewrite. Move the build spec to docs/.
Phase 2: bugs, in priority order

Broken on Windows

dialogSelectImportSource uses ['openFile','openDirectory']. Electron shows a folder-only picker on Windows for that combination, so you can’t pick a .zip or .jsonl, and Restore can’t select a backup zip at all. The fix is separate “File…” and “Folder…” buttons plus drag-and-drop.
readJsonLines doesn’t strip a BOM, so a .jsonl saved by Notepad throws on line 1. The same applies to hand-edited field-mappings.json.
Import, backup, restore, relink and auto-backup are all synchronous on the main thread, so Windows will show “Not Responding” on big libraries.
window.confirm and alert are used throughout. These are known to leave inputs unfocusable on Windows, so replace them with an in-app confirm dialog.
sanitizeFilename ignores reserved names (con, nul, …), trailing dots and case-insensitive collisions. A 150-char filename plus a deep %APPDATA% path can also exceed MAX_PATH, and the copy then fails and is marked “missing”.
windowState writes the file synchronously on every resize and move event, and never recovers if a saved monitor is gone.
Zip temp dirs from import, checkBackup and restore are never deleted. Restore also extracts the whole zip twice.
There’s no single-instance lock, so two windows can run on one DB with two auto-backup timers.

Data loss or corruption

Attachments with the same filename overwrite each other in the chat’s managed folder, in import, relink and restore. Both rows then point at one file.
pruneOldBackups matches every backup-*.zip, and the Export tab saves its destination as the auto-backup folder. A manual backup to a shared folder can therefore be deleted by auto-prune, and a half-written zip counts as a valid backup. Write to .tmp, then rename, and give auto-backups their own prefix.
Restore bugs:
remapFolders only sorts root versus non-root, so grandchildren can be processed before parents and fall back to the old id.
Trashed folders are exported and resurrected as live ones.
Restored files keep link_mode = 1 with a relative path, so those images 404.
The replace strategy leaves the old attachments directory behind.
The “duplicate” heuristic (title + character + message count) is also used by restore’s skip, so it can silently skip genuinely different chats.
ChatList selection only resets on trash-view change. After switching folder or search, bulk trash or permanent delete can act on chats you can’t see.
The renderer sends the whole Settings object back, so a stale copy clobbers lastRunAt and the auto-backup config. loadSettings has no try/catch and writes aren’t atomic. A hand-edited mappings file missing a format key gives a blank screen.

Correctness and UX

Renaming a chat appears to do nothing, because cards and the viewer header show character_name ?? title.
Search quotes the whole query as an FTS phrase, so typing “roof” doesn’t match “rooftop”. Search also overrides the folder selection, and out-of-order responses can show stale results.
tagSummary uses , and | as delimiters, so tag names containing them break. A duplicate tag name throws an unhandled rejection.
Folder drag-and-drop:
You can’t nest an existing folder into another.
Downward moves land one slot off.
Dropping a chat on the Trash row moves it to root.
“Sort by Message Count” sorts by chat count.
Deleted folders have no restore UI.
The field-mapping comma lists drop each comma as you type it, because fromCsv then toCsv re-renders the cleaned value on every keystroke.
Folder-scoped export ignores subfolders and allows zero folders, which produces an empty zip.
Prompt editor edits vanish when you switch blocks or sets. Ctrl+P also fires while typing.
body { user-select: none } means message text can’t be selected or copied.
Non-ISO SillyTavern dates (January 5, 2026 10:00am, epoch ms) render blank. ST is_system messages show as character bubbles.
The CSP has no media-src, and the app:// handler has no Range support.
Modal has no Esc key support.
shell.openExternal accepts any URL, sandbox is false though the preload doesn’t need it, and IPC inputs are unvalidated. A chatId goes straight into an rmSync path.
Phase 3: architecture and performance
Move heavy work off the main process. Run import, backup, restore, relink and stats in a worker or utilityProcess with its own DB connection (WAL allows it), async fs, and progress over a port. Mirror it to the Windows taskbar progress bar.
Typed IPC from one contract. Today ipc-channels.ts, preload/index.ts and register.ts are three hand-synced copies. Generate the preload from one contract, validate with zod, and return {ok, error} so the UI stops showing “Error invoking remote method…”.
Renderer structure. App.tsx is a god component with onFoldersChanged, onChatsChanged and onBulkChanged prop drilling. Use TanStack Query for fetching and invalidation, a small Zustand store for UI state, and feature folders.
Styling. Move from inline styles to CSS Modules or Tailwind with a real UI kit. This gets you focus states, keyboard and ARIA support, and lets you drop 'unsafe-inline' from the CSP.
Data model, in a new baseline migration using PRAGMA user_version:
Add content_hash, a normalized sent_at, last_message_at, a cached thumbnail_attachment_id, is_favorite and notes.
Store attachments content-addressed (<sha256>.<ext>). This fixes clobbering, reserved names, MAX_PATH and duplicate images in one change.
Stop sending raw_json in getChatDetail, and page messages.
Return tags via json_group_array.
Add the missing indexes.
Search. Use FTS5 with the trigram tokenizer (substring and CJK) plus snippet() and bm25 ranking.
Toolchain. Electron 31 is far out of support, so bump Electron, electron-vite, Vite, React, TS and Vitest on a dedicated branch.
Add an install-app-deps postinstall. Check the native ABI clash between better-sqlite3 under Vitest (Node) and under Electron.
Add CI on windows-latest.
importChat, backup, restore, relink, settings and auto-backup have zero tests because they import electron. Inject userDataDir so you can add a backup round-trip test, which would have caught most restore bugs above.
Phase 4: features
Reading:
Sanitized markdown and RP rendering (asterisk actions, quotes), swipes, copy-message.
In-chat find, and jump-to-message from search results.
Remembered scroll position.
Lightbox with prev/next and zoom.
Open file or show in Explorer, and video/audio playback.
Library:
Sort options, last-message preview, smarter titles from the filename or first line.
Pin or favorite, notes, and character grouping with avatars.
Multi-tag filter, and tag, rename and move from the viewer header.
Empty Trash, auto-purge and folder restore.
Shift-click and Ctrl+A selection, resizable panes, and remembered layout.
Import:
Drag-drop, batch and folder import, and a watch folder.
“Update existing chat”, which appends new messages using the content hash. Right now a re-export of a grown chat creates a full second copy.
Re-parse a chat from stored raw_json after fixing mappings. This is the “unknown format” flow your spec promised but the code never built.
A per-line error report that can skip bad lines.
Export: a single chat to md, html, txt or original jsonl.
Backup and health:
Include settings and mappings, verify the zip after writing, and add “Backup now” and “Open folder”.
A Library Health screen covering missing files, orphans, duplicates and VACUUM.
Prompts: autosave, ST preset JSON import and export, and a token estimate.
Polish: light, dark and system theme, density options, a Ctrl+K command palette, and consistent shortcuts.
Phase 5: Windows polish and shipping
Let users choose the library location. Roaming %APPDATA% is a poor home for GBs of images.
Set AppUserModelID, a real icon and titleBarOverlay.
Single-instance lock, with “open with” and drag-onto-exe handing the file to the running instance.
NSIS per-user plus a portable build, code signing, and electron-updater.
electron-log with an “Open logs folder” action.
Trim the application menu.
Suggested order
M0: Phase 0 plus the rename decision.
M1, “1.1 Stabilize”: the delete list plus the Windows-breaking and data-loss fixes, with no new features. This gives you a safe baseline to ship.
M2, foundation: worker process, typed IPC, baseline migration, content-addressed attachments, UI kit.
M3, the 2.0 features: reading, search, library and import improvements.
M4: packaging and polish.

I’d start with M1, beginning with the dialog fix, BOM stripping and the dead-code commit, since each is small and safe. Want me to write those first? I can also turn this into a ROADMAP-2.0.md with checkboxes if you’d like it in the repo.
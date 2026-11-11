# Chat Archiver — Build Spec

A desktop app for importing, browsing, and backing up chat exports produced
by two existing browser extensions (SillyTavern and Marinara Engine
versions of "Portable Chat Exporter"). SillyTavern-style UI: sidebar tree
of folders on the left, chat list + chat viewer in the middle/right.

This doc is written to be handed directly to an AI coding assistant as a
build spec. It defines exact schemas, file layouts, IPC contracts, and a
phase-by-phase task breakdown. Follow it literally; where a decision is
left open, it's marked `DECISION NEEDED`.

---

## 1. Tech stack

- **Shell:** Electron (`electron-builder` for packaging).
- **Renderer:** React + TypeScript, no CSS framework required — build a
  small custom component set matching the SillyTavern visual reference
  (dark theme, rounded pill buttons, tree rows with folder icons).
- **DB:** SQLite via `better-sqlite3` (synchronous, runs in the Electron
  **main** process only — never require it from the renderer).
- **IPC:** `contextBridge` + `ipcRenderer.invoke` / `ipcMain.handle`
  (promise-based request/response), no direct Node access from renderer
  (`contextIsolation: true`, `nodeIntegration: false`).
- **Zip:** `archiver` (write) + `unzipper` or `adm-zip` (read) — since this
  runs in Node, there's no reason to reuse the extensions' dependency-free
  browser zip writer. Use real libraries.
- **Drag-and-drop tree:** `@dnd-kit/core` (actively maintained, no legacy
  HTML5 DnD quirks).
- **File watching (optional, Phase 7):** `chokidar`.

---

## 2. Data model (SQLite DDL)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE folders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id     INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,   -- sort order within parent
  color         TEXT,                          -- hex string, nullable
  icon          TEXT,                          -- icon key, nullable -> default folder icon
  is_system     INTEGER NOT NULL DEFAULT 0,    -- 1 for "All" / "Trash" virtual roots (see note below)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chats (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id         INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,             -- character_name or user-renamed title
  source_format     TEXT NOT NULL,             -- 'sillytavern' | 'marinara' | 'flat_v1' | 'unknown'
  character_name    TEXT,
  user_name         TEXT,
  message_count     INTEGER NOT NULL DEFAULT 0,
  attachment_count  INTEGER NOT NULL DEFAULT 0,
  chat_metadata     TEXT,                      -- raw JSON blob (header line / context.chatMetadata etc.)
  original_source_path TEXT,                   -- path/zip the import came from, for reference
  imported_at       TEXT NOT NULL DEFAULT (datetime('now')),
  is_trashed        INTEGER NOT NULL DEFAULT 0,
  trashed_at        TEXT
);

CREATE TABLE messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id       INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,              -- 0-based order within chat
  sender_name   TEXT,
  is_user       INTEGER NOT NULL DEFAULT 0,    -- 0 = character/assistant, 1 = user, 2 = system
  send_date     TEXT,                          -- ISO string if known, else NULL
  text          TEXT,
  raw_json      TEXT NOT NULL,                 -- the original message object, untouched, for fidelity
  UNIQUE(chat_id, seq)
);

CREATE TABLE attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id    INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  label         TEXT,
  original_ref  TEXT,                          -- the path/URL as it appeared in the source export
  stored_path   TEXT NOT NULL,                 -- path relative to the app's managed attachments root
  mime_type     TEXT,
  link_mode     INTEGER NOT NULL DEFAULT 0,    -- 0 = copied into managed storage, 1 = external link only
  missing       INTEGER NOT NULL DEFAULT 0     -- 1 if file could not be found/copied at import time
);

CREATE TABLE tags (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  color         TEXT
);

CREATE TABLE chat_tags (
  chat_id       INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  tag_id        INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (chat_id, tag_id)
);

CREATE INDEX idx_chats_folder ON chats(folder_id);
CREATE INDEX idx_messages_chat ON messages(chat_id);
CREATE INDEX idx_attachments_message ON attachments(message_id);
```

**Note on "All" and "Trash":** don't store these as real rows with
`is_system=1` in the tree — treat them as two fixed pseudo-views in the
UI (`All` = every non-trashed chat regardless of folder, `Trash` =
`is_trashed=1`). Simpler than special-casing a DB row nobody can delete.
`Tags` are a flat list (matches the "Prompts & Tags" reference screenshot
being a separate flat tree, not nested under the chat folder tree) —
confirm this reading before Phase 3 if you're unsure
(`DECISION NEEDED` — see §9).

---

## 3. Filesystem layout

```
<Electron userData>/
  library.db                     -- SQLite file
  attachments/
    <chatId>/
      <original filename, sanitized>
  backups/
    (user-chosen location, not necessarily under userData — see §7)
```

Managed attachments are always copied here on import **unless the user
chose link mode for that import**, in which case `attachments.stored_path`
holds an absolute path outside this tree and `link_mode = 1`.

---

## 4. Import pipeline

### 4.1 Input detection

On "Import Chat(s)", accept either:
- a `.zip` (as produced by both extensions) — unzip to a temp dir first
- a loose folder containing `chat.jsonl` / `chat.txt` and an
  `attachments/` subfolder

Detect source format by sniffing the **first line** of `chat.jsonl`:

| Signal in first line | `source_format` |
|---|---|
| Has `mes` key anywhere in file, OR first line has `user_name`+`character_name`+`chat_metadata` header shape | `sillytavern` |
| No fixed guessable shape; whatever fields the Marinara `CONFIG` produced (commonly `role`/`text`/`is_user`/similar, but *not guaranteed* — see 4.2) | `marinara` |
| Flat shape: `{index, role, name, time, text, attachments}` per line, no header line | `flat_v1` |
| None of the above match | `unknown` — still import, store `raw_json` for every message, leave `text`/`sender_name`/`is_user` best-effort or null, and flag the chat for manual field mapping in the UI |

### 4.2 Field-mapping config

Store a **user-editable JSON config** (not hardcoded in source) at
`<userData>/field-mappings.json`, structure:

```json
{
  "sillytavern": {
    "textFields": ["mes"],
    "senderNameField": "name",
    "isUserField": "is_user",
    "dateField": "send_date",
    "attachmentPaths": ["extra.image", "extra.media[].url", "extra.files[].url", "extra.file.url"]
  },
  "marinara": {
    "textFields": ["mes", "text", "content", "message"],
    "senderNameField": "name",
    "isUserField": "is_user",
    "dateField": "send_date",
    "attachmentPaths": ["attachments[]", "files[].url"]
  },
  "flat_v1": {
    "textFields": ["text"],
    "senderNameField": "name",
    "isUserField": null,
    "roleField": "role",
    "roleUserValue": "user",
    "roleAssistantValue": "assistant",
    "roleSystemValue": "system",
    "dateField": "time",
    "attachmentPaths": ["attachments[]"]
  }
}
```

Parser logic: for each message object, try `textFields` in order (first
non-empty wins), resolve `isUserField` boolean **or** `roleField` mapped
through `roleUserValue`/`roleAssistantValue`/`roleSystemValue`, resolve
attachment paths by walking the dot/bracket path syntax above (`foo.bar[].baz`
means: for each item in array `foo.bar`, take `.baz`). This mirrors the
`CONFIG`-driven approach already used in the Marinara extension's
`extension.js` — same philosophy, just centralized and user-editable via a
Settings UI screen instead of requiring a source edit + reimport.

Build a **Settings → Field Mappings** screen: one panel per source format,
text inputs for each field-path list, "Test against a sample file" button
that runs the parser against a chosen `chat.jsonl` and shows a preview
table (sender / text / attachment count per message) before committing.

### 4.3 Import algorithm

```
importChat(sourcePath, targetFolderId, linkMode):
  1. Resolve sourcePath to a working dir (unzip if needed)
  2. Read chat.jsonl, split into lines, JSON.parse each
  3. Detect source_format (4.1); if header line present, extract
     character_name / user_name / chat_metadata from it, else derive
     character_name from filename or first non-user message sender
  4. BEGIN TRANSACTION
  5. INSERT chats row (folder_id = targetFolderId, source_format, ...)
  6. For each message line (skip header line if present):
       a. Apply field mapping (4.2) -> {text, sender_name, is_user, send_date}
       b. INSERT messages row with raw_json = original line, seq = index
       c. Resolve attachment refs via attachmentPaths
       d. For each attachment ref:
            - if linkMode: verify file exists at resolved path (relative
              to the working dir's attachments/ folder); if missing,
              missing=1; store absolute resolved path in stored_path
            - else: copy file into
              <userData>/attachments/<chatId>/<sanitized-filename>;
              on copy failure, missing=1 and continue (don't abort import)
            - INSERT attachments row
  7. UPDATE chats SET message_count, attachment_count
  8. COMMIT
  9. Return { chatId, messageCount, attachmentCount, missingCount, unmappedFieldWarning }
```

Surface `unmappedFieldWarning` in the UI exactly like the extensions'
"couldn't load messages" pattern in the READMEs — point the user at the
Field Mappings settings screen instead of a dead end.

### 4.4 Filename sanitization

Reuse the same rule already used in `index.js`:
`name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 150) || "file"`.

---

## 5. IPC contract (main ⇄ renderer)

All channels are `ipcMain.handle` / `ipcRenderer.invoke`, request/response,
no raw `send`/`on` except for progress events during long imports/backups.

| Channel | Payload → | Returns |
|---|---|---|
| `folders:list` | — | `Folder[]` (full tree, flat array w/ parent_id, client builds tree) |
| `folders:create` | `{parentId, name}` | `Folder` |
| `folders:rename` | `{id, name}` | `Folder` |
| `folders:move` | `{id, newParentId, newPosition}` | `void` |
| `folders:reorder` | `{parentId, orderedIds: number[]}` | `void` |
| `folders:setColor` | `{id, color}` | `Folder` |
| `folders:setIcon` | `{id, icon}` | `Folder` |
| `folders:delete` | `{id}` | `void` (cascades: children folders + their chats move to Trash, see §6) |
| `chats:listByFolder` | `{folderId \| "all" \| "trash"}` | `ChatSummary[]` |
| `chats:get` | `{chatId}` | `{chat, messages, attachments}` |
| `chats:move` | `{chatId, targetFolderId}` | `void` |
| `chats:rename` | `{chatId, title}` | `void` |
| `chats:trash` | `{chatId}` | `void` |
| `chats:restore` | `{chatId}` | `void` |
| `chats:deletePermanent` | `{chatId}` | `void` (also deletes managed attachment files) |
| `import:start` | `{sourcePath, targetFolderId, linkMode}` | `ImportResult` (also emits `import:progress` events) |
| `backup:export` | `{destPath, scope: "all" \| folderId[]}` | `{path, chatCount, fileCount}` |
| `backup:restore` | `{sourcePath, mergeStrategy: "skip" \| "duplicate" \| "replace"}` | `RestoreResult` |
| `settings:get` / `settings:set` | ... | field-mapping config, storage paths, link-mode default |
| `tags:list` / `tags:create` / `tags:assign` / `tags:unassign` | ... | — |

---

## 6. Sidebar tree — behavior spec

**Top-level fixed rows, in this order:**
1. `All` (pseudo-view, all non-trashed chats across all folders)
2. *(user's folder tree, root-level folders and down, drag-reorderable)*
3. `Trash` (pseudo-view, pinned at the bottom, per your instruction)

**Right-click context menu on a folder row** (exact items, matching your
reference screenshot):
- New Folder (`Ctrl+Shift+N`)
- New Subfolder (`Alt+N`)
- Rename (`F2`)
- Move Up
- Move Down
- Sort Current Level By ▸ (submenu: Name, Date Added, Message Count, Manual)
- Assign Color ▸ (submenu: color swatch picker)
- Change Icon ▸ (submenu: icon picker grid)
- Delete Folder *(red text)*

**Delete Folder semantics:** soft-delete. All chats directly in that
folder, and in any descendant folder, get `is_trashed=1`. The folder rows
themselves: either (a) also soft-delete the folder row (needs an
`is_trashed` column added to `folders` too — **recommended**, add it to
the DDL above) so the tree structure can be restored later, or (b) hard
delete folder rows immediately and only trash the chats. **Pick (a)** —
matches user expectation of "delete folder" being undoable via Trash,
consistent with how chats behave.

*(Correction to §2 DDL: add `is_trashed INTEGER NOT NULL DEFAULT 0` and
`trashed_at TEXT` to `folders` table to support this.)*

**Drag-and-drop:** folders reorder within a parent and can be dropped
onto another folder to reparent. Chats in the middle pane can be dragged
onto a sidebar folder to move them.

---

## 7. Middle/right pane

- **Chat list** (when a folder/All/Trash is selected): card per chat
  showing title, character_name, message_count, imported_at, small
  thumbnail if the first attachment is an image.
- **Chat viewer** (chat opened): virtualized message list (use
  `react-window` or `@tanstack/react-virtual` — these transcripts can run
  thousands of lines per the SillyTavern-style export), each message row:
  sender name, timestamp, text, inline attachment thumbnails that open a
  lightbox on click. Attachment resolution: if `link_mode=0`, load from
  `<userData>/attachments/<chatId>/...` via a custom `app://` protocol
  handler (don't expose the raw filesystem path to the renderer); if
  `link_mode=1` and `missing=0`, load from the stored absolute path the
  same way; if `missing=1`, show a broken-image placeholder with the
  original path in a tooltip.
- Top bar: search box (filters chat list by title/character_name/message
  text — simple `LIKE` query is fine for v1, add FTS5 virtual table later
  if performance demands it), "Import" button, "Export Backup" button.

---

## 8. Backup / restore

### Export (`backup:export`)
Produces a single `.zip`:
```
backup-<timestamp>.zip
  manifest.json          -- {version, exportedAt, folderCount, chatCount}
  folders.json           -- full folders table dump (array of rows)
  tags.json
  chats/
    <chatId>/
      chat.json           -- {chat row, messages[] with raw_json, attachments[] metadata}
      attachments/
        <files, only for link_mode=0 chats; link_mode=1 chats are NOT
         copied into the backup, just referenced by their external path
         — flag this clearly in the UI before export so nothing is
         silently missing from the backup>
```
Use `archiver` in streaming mode so large libraries with many images
don't need to buffer the whole zip in memory.

### Restore (`backup:restore`)
Unzip to temp, read `manifest.json` + `folders.json` + `tags.json`,
re-create folder tree (preserve original ids where possible via an
id-remapping table if merging into an existing library), then per-chat
JSON: insert chat/messages/attachments rows, copy attachment files back
into managed storage. `mergeStrategy`:
- `skip` — if a chat with the same title+character+message_count already
  exists, don't re-import it
- `duplicate` — always import as a new chat
- `replace` — delete the existing matching chat first, then import

---

## 9. Open decisions before you start coding

1. **Tags vs. nested "Prompts & Tags" folder tree** — confirm whether tags
   are a flat list (as modeled in §2) or need their own separate
   hierarchical tree mirroring the chat-folder tree structure. This
   changes the `tags` table from a flat list to a self-referencing tree
   like `folders`.
2. **Icon set** — pick a concrete icon library (`lucide-react` is a
   reasonable default, dependency-free-ish, works well in Electron).
3. **Link mode default** — should imports default to copy-into-managed-
   storage, or link-to-original-folder? Recommend **copy by default**,
   link mode as an explicit opt-in checkbox on the import dialog, since
   backups become incomplete for linked attachments (see §8).

---

## 10. Phased task breakdown (for the coding agent)

**Phase 1 — Scaffolding**
- `npm init`, Electron + electron-builder + TypeScript + React setup.
- Main process entry (`src/main/index.ts`), preload script with
  `contextBridge` exposing a typed `window.api` matching §5 exactly.
- Renderer entry, basic window chrome, dark theme CSS variables (reuse the
  same variable-naming spirit as `--SmartThemeBodyColor` etc. from the
  reference CSS if you want visual parity, but define your own set).
- Create `library.db` on first launch, run DDL from §2 via a migrations
  file (`src/main/db/migrations/001_init.sql`), wire `better-sqlite3`.

**Phase 2 — Import pipeline**
- Implement `src/main/import/detectFormat.ts`, `parseByFieldMapping.ts`,
  `importChat.ts` per §4.
- `field-mappings.json` default file + Settings → Field Mappings screen
  with "test against sample" preview.
- Import dialog (renderer): file/folder picker, target folder select,
  link-mode checkbox, progress bar wired to `import:progress` events.

**Phase 3 — Sidebar tree**
- Folder CRUD IPC handlers + renderer tree component with `@dnd-kit`.
- Context menu component matching §6 exactly (including keyboard
  shortcuts `Ctrl+Shift+N`, `Alt+N`, `F2`).
- Color/icon pickers.

**Phase 4 — Chat list + viewer**
- Chat list pane bound to selected sidebar node.
- Virtualized chat viewer, `app://` protocol handler for attachment
  loading, lightbox component.
- Search box wired to a `chats:search` IPC channel (simple `LIKE` query
  across `chats.title`/`character_name` and `messages.text`).

**Phase 5 — Trash lifecycle**
- Soft-delete wiring for both folders and chats per §6.
- Trash pseudo-view in chat list, "Restore" and "Delete Permanently"
  actions (permanent delete also removes files under
  `attachments/<chatId>/`).

**Phase 6 — Backup / restore**
- `backup:export` per §8 using `archiver` streaming.
- `backup:restore` with the three merge strategies.
- Settings screen: default backup folder, "Backup now" button, optional
  scheduled backup (Phase 7 stretch).

**Phase 7 — Polish / stretch**
- Tags UI (pending decision in §9.1).
- FTS5 full-text search if `LIKE` search feels slow on large libraries.
- `chokidar` watch on a designated "auto-import" drop folder, if wanted.
- Auto-update wiring via `electron-updater`.

**Phase 8 — Packaging**
- `electron-builder` config for your target OS(es), app icon, code
  signing if distributing outside your own machine.

---

## 11. Sample data notes for the coding agent

Three real message-object shapes have been observed and should all be
covered by tests:

1. **SillyTavern** — header line `{user_name, character_name,
   create_date, chat_metadata}` then per-message `{mes, is_user, name,
   send_date, extra: {image?, media?: [{url,...}], files?/file?}}`.
2. **Marinara** — field names are install-specific per that extension's
   own `CONFIG` block; treat as unverified until a real sample is
   captured and the mapping in `field-mappings.json` is confirmed against
   it.
3. **`flat_v1`** — no header line, per-message `{index, role, name, time,
   text, attachments: ["attachments/msg-0001-1-1.webp", ...]}`, where
   `role` is `"system" | "user" | "assistant"`.

Write unit tests for `parseByFieldMapping.ts` against one fixture file per
shape so future format drift (e.g., a SillyTavern update changing
`extra.media`) is caught by a failing test rather than a silent bad
import — same failure mode both extension READMEs already warn about.

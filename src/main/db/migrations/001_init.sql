PRAGMA foreign_keys = ON;

CREATE TABLE folders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id     INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  color         TEXT,
  icon          TEXT,
  is_system     INTEGER NOT NULL DEFAULT 0,
  is_trashed    INTEGER NOT NULL DEFAULT 0,   -- §6 correction: soft-delete support
  trashed_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chats (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id         INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  source_format     TEXT NOT NULL,
  character_name    TEXT,
  user_name         TEXT,
  message_count     INTEGER NOT NULL DEFAULT 0,
  attachment_count  INTEGER NOT NULL DEFAULT 0,
  chat_metadata     TEXT,
  original_source_path TEXT,
  imported_at       TEXT NOT NULL DEFAULT (datetime('now')),
  is_trashed        INTEGER NOT NULL DEFAULT 0,
  trashed_at        TEXT
);

CREATE TABLE messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id       INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  sender_name   TEXT,
  is_user       INTEGER NOT NULL DEFAULT 0,
  send_date     TEXT,
  text          TEXT,
  raw_json      TEXT NOT NULL,
  UNIQUE(chat_id, seq)
);

CREATE TABLE attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id    INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  label         TEXT,
  original_ref  TEXT,
  stored_path   TEXT NOT NULL,
  mime_type     TEXT,
  link_mode     INTEGER NOT NULL DEFAULT 0,
  missing       INTEGER NOT NULL DEFAULT 0
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

CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_chats_folder ON chats(folder_id);
CREATE INDEX idx_messages_chat ON messages(chat_id);
CREATE INDEX idx_attachments_message ON attachments(message_id);

CREATE TABLE _migrations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  applied_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

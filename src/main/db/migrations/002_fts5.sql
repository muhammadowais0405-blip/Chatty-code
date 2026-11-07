-- FTS5 full-text search tables (§10 Phase 7).
-- Upgrades search from O(n) LIKE scans to logarithmic FTS5 lookups.

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  text,
  content=messages,
  content_rowid=id
);

INSERT INTO messages_fts(rowid, text)
SELECT id, COALESCE(text, '') FROM messages;

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text) VALUES (new.id, COALESCE(new.text, ''));
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text)
    VALUES ('delete', old.id, COALESCE(old.text, ''));
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE OF text ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text)
    VALUES ('delete', old.id, COALESCE(old.text, ''));
  INSERT INTO messages_fts(rowid, text) VALUES (new.id, COALESCE(new.text, ''));
END;

CREATE VIRTUAL TABLE IF NOT EXISTS chats_fts USING fts5(
  title,
  character_name,
  content=chats,
  content_rowid=id
);

INSERT INTO chats_fts(rowid, title, character_name)
SELECT id, title, COALESCE(character_name, '') FROM chats;

CREATE TRIGGER IF NOT EXISTS chats_ai AFTER INSERT ON chats BEGIN
  INSERT INTO chats_fts(rowid, title, character_name)
    VALUES (new.id, new.title, COALESCE(new.character_name, ''));
END;

CREATE TRIGGER IF NOT EXISTS chats_ad AFTER DELETE ON chats BEGIN
  INSERT INTO chats_fts(chats_fts, rowid, title, character_name)
    VALUES ('delete', old.id, old.title, COALESCE(old.character_name, ''));
END;

CREATE TRIGGER IF NOT EXISTS chats_au AFTER UPDATE OF title, character_name ON chats BEGIN
  INSERT INTO chats_fts(chats_fts, rowid, title, character_name)
    VALUES ('delete', old.id, old.title, COALESCE(old.character_name, ''));
  INSERT INTO chats_fts(rowid, title, character_name)
    VALUES (new.id, new.title, COALESCE(new.character_name, ''));
END;

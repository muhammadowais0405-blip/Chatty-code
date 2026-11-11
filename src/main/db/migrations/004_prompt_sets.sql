CREATE TABLE IF NOT EXISTS prompt_sets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompt_blocks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id      INTEGER NOT NULL REFERENCES prompt_sets(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'system', -- 'system' | 'user' | 'assistant'
  content     TEXT NOT NULL DEFAULT '',
  enabled     INTEGER NOT NULL DEFAULT 1,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prompt_blocks_set ON prompt_blocks(set_id);

-- Migrate any existing flat prompts (from the earlier single-table version)
-- into one "Imported Prompts" set so nothing already saved is lost.
INSERT INTO prompt_sets (name)
SELECT 'Imported Prompts' WHERE EXISTS (SELECT 1 FROM prompts);

INSERT INTO prompt_blocks (set_id, name, role, content, enabled, position)
SELECT (SELECT id FROM prompt_sets WHERE name = 'Imported Prompts' ORDER BY id DESC LIMIT 1),
       title, 'system', content, 1, sort_order
FROM prompts;

DROP TABLE IF EXISTS prompts;

-- Private D1/SQLite database owned by this Site. Execute once in a migration,
-- not on every HTTP request. Do not expose this database over a public route.
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY, doc_type TEXT NOT NULL CHECK(doc_type IN ('summary','raw')),
  path TEXT NOT NULL, source_path TEXT, title TEXT NOT NULL,
  start_offset INTEGER, end_offset INTEGER, content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_type_id ON documents(doc_type, id);
CREATE INDEX IF NOT EXISTS documents_source ON documents(doc_type, source_path);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('preference','fact','project','interaction','roleplay')),
  tags TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  source_quote TEXT NOT NULL,
  consent TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(owner, memory_key)
);
CREATE INDEX IF NOT EXISTS memories_owner_time ON memories(owner, updated_at DESC);

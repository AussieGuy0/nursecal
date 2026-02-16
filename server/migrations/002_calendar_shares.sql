CREATE TABLE IF NOT EXISTS calendar_shares (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  shared_with_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_with_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (owner_id, shared_with_id)
);

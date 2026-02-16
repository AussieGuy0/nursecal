CREATE TABLE _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE calendar_shares (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  shared_with_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_with_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (owner_id, shared_with_id)
);

CREATE TABLE calendars (
  user_id INTEGER PRIMARY KEY,
  shifts TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE google_tokens (
  user_id INTEGER PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  scope TEXT NOT NULL,
  visible INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE labels (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  short_code TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE otc (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

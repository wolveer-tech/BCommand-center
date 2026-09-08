CREATE TABLE IF NOT EXISTS native_mirror_sessions (
  channel TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

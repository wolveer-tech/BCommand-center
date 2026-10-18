CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  salt TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_sessions_expiry ON account_sessions(expires_at);
CREATE TABLE IF NOT EXISTS account_notes (
  account_id TEXT NOT NULL REFERENCES accounts(id), id TEXT NOT NULL, revision INTEGER NOT NULL,
  object_key TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(account_id,id)
);
CREATE TABLE IF NOT EXISTS account_attempts (scope TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);

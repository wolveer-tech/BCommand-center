-- Transfers is a private, single-owner space shared by explicitly paired devices.
CREATE TABLE IF NOT EXISTS transfer_devices (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL, revoked_at INTEGER,
  push_subscription TEXT
);
CREATE TABLE IF NOT EXISTS transfer_pairings (
  code_hash TEXT PRIMARY KEY, created_by TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('file','message','link')),
  sender_id TEXT NOT NULL, recipient_id TEXT, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  filename TEXT, mime TEXT, size INTEGER NOT NULL DEFAULT 0, sha256 TEXT,
  object_key TEXT, upload_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('pending','ready','deleting')),
  created_at INTEGER NOT NULL, ready_at INTEGER, expires_at INTEGER,
  ttl INTEGER NOT NULL DEFAULT 86400, upload_deadline INTEGER,
  FOREIGN KEY(sender_id) REFERENCES transfer_devices(id)
);
CREATE INDEX IF NOT EXISTS transfers_inbox ON transfers(state,ready_at,id);
CREATE INDEX IF NOT EXISTS transfers_expiry ON transfers(expires_at);
CREATE TABLE IF NOT EXISTS transfer_receipts (
  transfer_id TEXT NOT NULL, device_id TEXT NOT NULL, read_at INTEGER NOT NULL,
  PRIMARY KEY(transfer_id,device_id)
);
CREATE TABLE IF NOT EXISTS transfer_deliveries (
  transfer_id TEXT NOT NULL, device_id TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  next_try INTEGER NOT NULL, sent_at INTEGER,
  PRIMARY KEY(transfer_id,device_id)
);

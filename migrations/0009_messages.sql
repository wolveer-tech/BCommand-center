CREATE TABLE IF NOT EXISTS device_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('message','link')),
  created_at INTEGER NOT NULL,
  UNIQUE(sender_id,client_id),
  FOREIGN KEY(sender_id) REFERENCES transfer_devices(id),
  FOREIGN KEY(recipient_id) REFERENCES transfer_devices(id)
);
CREATE INDEX IF NOT EXISTS device_messages_pair ON device_messages(sender_id,recipient_id,id);
CREATE INDEX IF NOT EXISTS device_messages_inbox ON device_messages(recipient_id,id);
CREATE TABLE IF NOT EXISTS message_reads (
  device_id TEXT NOT NULL, peer_id TEXT NOT NULL, last_read_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(device_id,peer_id)
);
CREATE TABLE IF NOT EXISTS message_pairings (
  created_by TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS message_pair_limits (
  scope TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS message_deliveries (
  message_id INTEGER PRIMARY KEY, recipient_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, next_try INTEGER NOT NULL, sent_at INTEGER
);

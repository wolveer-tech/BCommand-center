-- Link one Safari Home Screen Web Push receiver to an existing paired IPA
-- device. The link deliberately reuses transfer_devices.id, so it does not
-- create another visible device or message identity.
CREATE TABLE IF NOT EXISTS notification_companion_codes (
  code_hash TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_companion_links (
  device_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_companion_attempts (
  scope TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS notification_companion_codes_expiry
  ON notification_companion_codes(expires_at);

CREATE TABLE IF NOT EXISTS live_activity_devices (
  device_id TEXT PRIMARY KEY,
  start_token TEXT,
  preferences TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS live_activity_matches (
  device_id TEXT NOT NULL,
  match_id INTEGER NOT NULL,
  activity_id TEXT,
  update_token TEXT,
  last_sent INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  ended INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, match_id)
);

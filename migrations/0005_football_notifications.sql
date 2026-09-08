CREATE TABLE IF NOT EXISTS football_notification_preferences (
  device_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  team_id INTEGER,
  team_name TEXT NOT NULL DEFAULT '',
  team_crest TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Europe/London',
  notify_24h INTEGER NOT NULL DEFAULT 1,
  notify_1h INTEGER NOT NULL DEFAULT 1,
  notify_kickoff INTEGER NOT NULL DEFAULT 1,
  notify_final INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS football_notification_sent (
  device_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY(device_id,event_key)
);

CREATE INDEX IF NOT EXISTS idx_football_notifications_team
ON football_notification_preferences(enabled,team_id);

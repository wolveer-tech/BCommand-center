CREATE TABLE IF NOT EXISTS morning_briefing_preferences (
  device_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  local_time TEXT NOT NULL DEFAULT '07:30',
  timezone TEXT NOT NULL DEFAULT 'Europe/London',
  city TEXT NOT NULL DEFAULT 'London',
  bible_text TEXT NOT NULL DEFAULT '',
  last_sent_date TEXT,
  updated_at INTEGER NOT NULL
);

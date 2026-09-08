CREATE TABLE IF NOT EXISTS news_preferences (
  device_id TEXT PRIMARY KEY,
  world_enabled INTEGER NOT NULL DEFAULT 1,
  financial_enabled INTEGER NOT NULL DEFAULT 1,
  push_mode TEXT NOT NULL DEFAULT 'major',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS news_sent (
  device_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY(device_id, article_id)
);

CREATE TABLE IF NOT EXISTS news_cache (
  kind TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS account_ai_keys (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('deepseek','qwen')),
  sealed TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(account_id,provider)
);

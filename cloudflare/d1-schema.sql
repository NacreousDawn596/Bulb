CREATE TABLE IF NOT EXISTS bots (
  bot_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  total_restarts INTEGER NOT NULL DEFAULT 0,
  last_session_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS guilds (
  bot_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  guild_name TEXT,
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (bot_id, guild_id)
);

CREATE TABLE IF NOT EXISTS stats (
  bot_id TEXT NOT NULL,
  stat_key TEXT NOT NULL,
  stat_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (bot_id, stat_key)
);

CREATE TABLE IF NOT EXISTS configs (
  bot_id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  level TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_events_bot_created_at
ON runtime_events(bot_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_levels (
  bot_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  total_xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  last_xp_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bot_id, guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_levels_bot_guild_total_xp
ON user_levels(bot_id, guild_id, total_xp DESC);

CREATE TABLE IF NOT EXISTS reviver_backoff (
  bot_id TEXT PRIMARY KEY,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_failure_at INTEGER,
  next_allowed_at INTEGER NOT NULL DEFAULT 0,
  last_dispatched_at INTEGER,
  updated_at INTEGER NOT NULL
);

/**
 * d1.js - Cloudflare D1 Relational Storage Helper
 * 
 * This module interacts with Cloudflare D1 via the REST API.
 */

const dotenv = require('dotenv');
dotenv.config();

const { D1_DATABASE_ID, D1_API_TOKEN, D1_ACCOUNT_ID } = process.env;

const DEFAULT_GUILD_CONFIG = {
  modules: {
    level: { enabled: true },
    welcome: {
      enabled: false,
      channelId: null,
      message: 'Welcome {user} to {server}!',
    },
    goodbye: {
      enabled: false,
      channelId: null,
      message: 'Goodbye {user}.',
    },
  },
};

function levelFromTotalXp(totalXp) {
  return Math.max(1, Math.floor(0.1 * Math.sqrt(Math.max(0, totalXp))) + 1);
}

function safeParseJSON(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function deepMerge(base, override) {
  if (typeof base !== 'object' || base === null) {
    return override;
  }
  if (typeof override !== 'object' || override === null) {
    return base;
  }

  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      out[key] = deepMerge(base[key] || {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Executes a SQL query against Cloudflare D1.
 * @param {string} sql - The SQL query to execute.
 * @param {any[]} params - Parameters for the SQL query.
 * @returns {Promise<any>} - The query result.
 */
async function queryD1(sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql,
      params,
    }),
  });

  const data = await response.json();

  if (!data.success) {
    console.error('D1 Query Error:', JSON.stringify(data.errors));
    throw new Error(`D1 Query Failed: ${data.errors[0]?.message || 'Unknown error'}`);
  }

  return data.result[0];
}

/**
 * Initializes the D1 database schema.
 */
async function initD1() {
  console.log('Initializing D1 schema...');
  await queryD1(`
    CREATE TABLE IF NOT EXISTS stats (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  await queryD1(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL
    );
  `);

  await queryD1(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL
    );
  `);

  await queryD1(`
    CREATE TABLE IF NOT EXISTS user_levels (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      total_xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      last_xp_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );
  `);

  await queryD1(`
    CREATE INDEX IF NOT EXISTS idx_user_levels_guild_total_xp
    ON user_levels(guild_id, total_xp DESC);
  `);

  await queryD1(`
    CREATE TABLE IF NOT EXISTS command_stats (
      command TEXT PRIMARY KEY,
      uses INTEGER NOT NULL DEFAULT 0
    );
  `);
}

/**
 * Gets a stat value from D1.
 * @param {string} key - The stat key.
 * @returns {Promise<string|null>}
 */
async function getStat(key) {
  try {
    const result = await queryD1('SELECT value FROM stats WHERE key = ?', [key]);
    return result?.results?.[0]?.value || null;
  } catch (error) {
    console.error(`Error getting stat ${key}:`, error);
    return null;
  }
}

/**
 * Sets a stat value in D1.
 * @param {string} key - The stat key.
 * @param {string} value - The stat value.
 */
async function setStat(key, value) {
  try {
    await queryD1('INSERT OR REPLACE INTO stats (key, value) VALUES (?, ?)', [key, value]);
  } catch (error) {
    console.error(`Error setting stat ${key}:`, error);
  }
}

async function getGuildConfig(guildId) {
  const result = await queryD1(
    'SELECT config_json FROM guild_settings WHERE guild_id = ?',
    [guildId],
  );
  const row = result?.results?.[0];
  if (!row?.config_json) {
    return DEFAULT_GUILD_CONFIG;
  }

  const parsed = safeParseJSON(row.config_json, {});
  return deepMerge(DEFAULT_GUILD_CONFIG, parsed);
}

async function setGuildConfig(guildId, config) {
  const merged = deepMerge(DEFAULT_GUILD_CONFIG, config || {});
  await queryD1(
    'INSERT OR REPLACE INTO guild_settings (guild_id, config_json) VALUES (?, ?)',
    [guildId, JSON.stringify(merged)],
  );
  return merged;
}

async function getUserLevel(guildId, userId) {
  const result = await queryD1(
    'SELECT xp, total_xp, level, last_xp_at FROM user_levels WHERE guild_id = ? AND user_id = ?',
    [guildId, userId],
  );

  const row = result?.results?.[0];
  if (!row) {
    return {
      guildId,
      userId,
      xp: 0,
      totalXp: 0,
      level: 1,
      lastXpAt: 0,
    };
  }

  return {
    guildId,
    userId,
    xp: Number(row.xp || 0),
    totalXp: Number(row.total_xp || 0),
    level: Number(row.level || 1),
    lastXpAt: Number(row.last_xp_at || 0),
  };
}

async function addXp(guildId, userId, amount, cooldownMs = 60000) {
  const current = await getUserLevel(guildId, userId);
  const now = Date.now();

  if (now - current.lastXpAt < cooldownMs) {
    return {
      awarded: false,
      leveledUp: false,
      ...current,
    };
  }

  const totalXp = current.totalXp + amount;
  const level = levelFromTotalXp(totalXp);
  const leveledUp = level > current.level;

  await queryD1(
    `
      INSERT INTO user_levels (guild_id, user_id, xp, total_xp, level, last_xp_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET
        xp = excluded.xp,
        total_xp = excluded.total_xp,
        level = excluded.level,
        last_xp_at = excluded.last_xp_at
    `,
    [guildId, userId, amount, totalXp, level, now],
  );

  return {
    awarded: true,
    leveledUp,
    guildId,
    userId,
    xp: amount,
    totalXp,
    level,
    lastXpAt: now,
  };
}

async function getLeaderboard(guildId, limit = 10) {
  const result = await queryD1(
    'SELECT user_id, level, total_xp FROM user_levels WHERE guild_id = ? ORDER BY total_xp DESC LIMIT ?',
    [guildId, Math.max(1, Math.min(limit, 25))],
  );
  return result?.results || [];
}

async function addCommandUse(commandName) {
  await queryD1(
    `
      INSERT INTO command_stats (command, uses)
      VALUES (?, 1)
      ON CONFLICT(command) DO UPDATE SET uses = uses + 1
    `,
    [commandName],
  );
}

async function getTopCommands(limit = 5) {
  const result = await queryD1(
    'SELECT command, uses FROM command_stats ORDER BY uses DESC LIMIT ?',
    [Math.max(1, Math.min(limit, 25))],
  );
  return result?.results || [];
}

module.exports = {
  initD1,
  getStat,
  setStat,
  getGuildConfig,
  setGuildConfig,
  getUserLevel,
  addXp,
  getLeaderboard,
  addCommandUse,
  getTopCommands,
};

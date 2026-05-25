import { BotConfig } from "../config/bots";
import { BotRuntimeState } from "../state/botState";
import { Logger } from "./logger";

type D1ResultRow = Record<string, unknown>;
type D1Response = {
  success: boolean;
  result: Array<{
    success: boolean;
    results?: D1ResultRow[];
    meta?: Record<string, unknown>;
  }>;
  errors?: Array<{ message?: string }>;
};

export type GuildConfig = {
  modules: {
    level: {
      enabled: boolean;
    };
    welcome: {
      channelId: string | null;
      enabled: boolean;
      message: string;
    };
    goodbye: {
      channelId: string | null;
      enabled: boolean;
      message: string;
    };
  };
};

export type UserLevelProfile = {
  guildId: string;
  userId: string;
  xp: number;
  totalXp: number;
  level: number;
  lastXpAt: number;
};

const DEFAULT_GUILD_CONFIG: GuildConfig = {
  modules: {
    level: { enabled: true },
    welcome: {
      enabled: false,
      channelId: null,
      message: "Welcome {user} to {server}!",
    },
    goodbye: {
      enabled: false,
      channelId: null,
      message: "Goodbye {user}.",
    },
  },
};

function safeParseJSON<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function deepMerge<T>(base: T, override: Partial<T> | null | undefined): T {
  if (!override || typeof override !== "object") {
    return base;
  }

  if (!base || typeof base !== "object") {
    return override as T;
  }

  const output: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = deepMerge((output[key] ?? {}) as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }

  return output as T;
}

function levelFromTotalXp(totalXp: number): number {
  return Math.max(1, Math.floor(0.1 * Math.sqrt(Math.max(0, totalXp))) + 1);
}

export type ReviverBackoffState = {
  botId: string;
  consecutiveFailures: number;
  lastFailureAt: number | null;
  nextAllowedAt: number;
  lastDispatchedAt: number | null;
  updatedAt: number;
};

export class D1Service {
  private readonly endpoint: string;

  constructor(private readonly logger: Logger) {
    const accountId = process.env.D1_ACCOUNT_ID;
    const databaseId = process.env.D1_DATABASE_ID;

    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  }

  private async query(sql: string, params: unknown[] = []): Promise<D1ResultRow[]> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.D1_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    });

    const data = (await response.json()) as D1Response;

    if (!response.ok || !data.success) {
      this.logger.error("D1 query failed", {
        sql,
        errors: data.errors,
        status: response.status,
      });
      throw new Error(data.errors?.[0]?.message ?? "Unknown D1 failure");
    }

    return data.result[0]?.results ?? [];
  }

  async initSchema(): Promise<void> {
    const schema = await Bun.file("cloudflare/d1-schema.sql").text();
    const statements = schema
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await this.query(statement);
    }

    this.logger.info("D1 schema ready");
  }

  async upsertBot(config: BotConfig, state: BotRuntimeState): Promise<void> {
    const now = Date.now();
    await this.query(
      `
        INSERT INTO bots (bot_id, created_at, updated_at, total_restarts, last_session_id, enabled)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(bot_id) DO UPDATE SET
          updated_at = excluded.updated_at,
          total_restarts = excluded.total_restarts,
          last_session_id = excluded.last_session_id,
          enabled = excluded.enabled
      `,
      [
        config.id,
        now,
        now,
        state.totalRestarts,
        state.sessionId,
        config.enabled ? 1 : 0,
      ],
    );

    await this.query(
      `
        INSERT INTO configs (bot_id, config_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(bot_id) DO UPDATE SET
          config_json = excluded.config_json,
          updated_at = excluded.updated_at
      `,
      [config.id, JSON.stringify(config), now],
    );
  }

  async syncGuilds(botId: string, guilds: Array<{ id: string; name: string }>): Promise<void> {
    const now = Date.now();
    for (const guild of guilds) {
      await this.query(
        `
          INSERT INTO guilds (bot_id, guild_id, guild_name, joined_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(bot_id, guild_id) DO UPDATE SET
            guild_name = excluded.guild_name,
            updated_at = excluded.updated_at
        `,
        [botId, guild.id, guild.name, now, now],
      );
    }

    if (guilds.length === 0) {
      await this.query("DELETE FROM guilds WHERE bot_id = ?", [botId]).catch(() => {
        this.logger.warn("Guild cleanup skipped", { botId });
      });
      return;
    }

    await this.query("DELETE FROM guilds WHERE bot_id = ? AND guild_id NOT IN (SELECT value FROM json_each(?))", [
      botId,
      JSON.stringify(guilds.map((guild) => guild.id)),
    ]).catch(() => {
      this.logger.warn("Guild cleanup skipped", { botId });
    });
  }

  async setStat(botId: string, key: string, value: string): Promise<void> {
    await this.query(
      `
        INSERT INTO stats (bot_id, stat_key, stat_value, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(bot_id, stat_key) DO UPDATE SET
          stat_value = excluded.stat_value,
          updated_at = excluded.updated_at
      `,
      [botId, key, value, Date.now()],
    );
  }

  async getStat(botId: string, key: string): Promise<string | null> {
    const rows = await this.query("SELECT stat_value FROM stats WHERE bot_id = ? AND stat_key = ?", [botId, key]);
    const value = rows[0]?.stat_value;
    return typeof value === "string" ? value : null;
  }

  async recordRuntimeEvent(
    botId: string,
    eventType: string,
    level: "info" | "warn" | "error",
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.query(
      `
        INSERT INTO runtime_events (bot_id, event_type, level, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      [botId, eventType, level, payload ? JSON.stringify(payload) : null, Date.now()],
    );
  }

  async incrementTotalRestarts(botId: string): Promise<number> {
    const currentValue = Number((await this.getStat(botId, "total_restarts")) ?? "0") + 1;
    await this.setStat(botId, "total_restarts", String(currentValue));
    return currentValue;
  }

  async getReviverBackoff(botId: string): Promise<ReviverBackoffState> {
    const rows = await this.query("SELECT * FROM reviver_backoff WHERE bot_id = ?", [botId]);
    const row = rows[0];
    if (!row) {
      return {
        botId,
        consecutiveFailures: 0,
        lastFailureAt: null,
        nextAllowedAt: 0,
        lastDispatchedAt: null,
        updatedAt: 0,
      };
    }

    return {
      botId,
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
      lastFailureAt: row.last_failure_at ? Number(row.last_failure_at) : null,
      nextAllowedAt: Number(row.next_allowed_at ?? 0),
      lastDispatchedAt: row.last_dispatched_at ? Number(row.last_dispatched_at) : null,
      updatedAt: Number(row.updated_at ?? 0),
    };
  }

  async updateReviverBackoff(state: ReviverBackoffState): Promise<void> {
    await this.query(
      `
        INSERT INTO reviver_backoff (
          bot_id,
          consecutive_failures,
          last_failure_at,
          next_allowed_at,
          last_dispatched_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(bot_id) DO UPDATE SET
          consecutive_failures = excluded.consecutive_failures,
          last_failure_at = excluded.last_failure_at,
          next_allowed_at = excluded.next_allowed_at,
          last_dispatched_at = excluded.last_dispatched_at,
          updated_at = excluded.updated_at
      `,
      [
        state.botId,
        state.consecutiveFailures,
        state.lastFailureAt,
        state.nextAllowedAt,
        state.lastDispatchedAt,
        state.updatedAt,
      ],
    );
  }

  async resetReviverBackoff(botId: string): Promise<void> {
    await this.updateReviverBackoff({
      botId,
      consecutiveFailures: 0,
      lastFailureAt: null,
      nextAllowedAt: 0,
      lastDispatchedAt: null,
      updatedAt: Date.now(),
    });
  }

  async getGuildConfig(botId: string, guildId: string): Promise<GuildConfig> {
    const config = safeParseJSON<Partial<GuildConfig>>(
      await this.getStat(botId, `guild_config:${guildId}`),
      {},
    );
    return deepMerge(DEFAULT_GUILD_CONFIG, config);
  }

  async setGuildConfig(botId: string, guildId: string, config: Partial<GuildConfig>): Promise<GuildConfig> {
    const merged = deepMerge(DEFAULT_GUILD_CONFIG, config);
    await this.setStat(botId, `guild_config:${guildId}`, JSON.stringify(merged));
    return merged;
  }

  async getUserLevel(botId: string, guildId: string, userId: string): Promise<UserLevelProfile> {
    const rows = await this.query(
      `
        SELECT xp, total_xp, level, last_xp_at
        FROM user_levels
        WHERE bot_id = ? AND guild_id = ? AND user_id = ?
      `,
      [botId, guildId, userId],
    );
    const row = rows[0];
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
      xp: Number(row.xp ?? 0),
      totalXp: Number(row.total_xp ?? 0),
      level: Number(row.level ?? 1),
      lastXpAt: Number(row.last_xp_at ?? 0),
    };
  }

  async addXp(botId: string, guildId: string, userId: string, amount: number, cooldownMs = 60_000) {
    const current = await this.getUserLevel(botId, guildId, userId);
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

    await this.query(
      `
        INSERT INTO user_levels (
          bot_id,
          guild_id,
          user_id,
          xp,
          total_xp,
          level,
          last_xp_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(bot_id, guild_id, user_id) DO UPDATE SET
          xp = excluded.xp,
          total_xp = excluded.total_xp,
          level = excluded.level,
          last_xp_at = excluded.last_xp_at
      `,
      [botId, guildId, userId, amount, totalXp, level, now],
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

  async getLeaderboard(botId: string, guildId: string, limit = 10) {
    return await this.query(
      `
        SELECT user_id, level, total_xp
        FROM user_levels
        WHERE bot_id = ? AND guild_id = ?
        ORDER BY total_xp DESC
        LIMIT ?
      `,
      [botId, guildId, Math.max(1, Math.min(limit, 25))],
    );
  }

  async addCommandUse(botId: string, commandName: string): Promise<void> {
    const key = `command:${commandName.toLowerCase()}`;
    const current = Number((await this.getStat(botId, key)) ?? "0") + 1;
    await this.setStat(botId, key, String(current));
  }

  async getTopCommands(botId: string, limit = 5): Promise<Array<{ command: string; uses: number }>> {
    const rows = await this.query(
      `
        SELECT stat_key, stat_value
        FROM stats
        WHERE bot_id = ? AND stat_key LIKE 'command:%'
        ORDER BY CAST(stat_value AS INTEGER) DESC
        LIMIT ?
      `,
      [botId, Math.max(1, Math.min(limit, 25))],
    );

    return rows.map((row) => ({
      command: String(row.stat_key ?? "").replace(/^command:/, ""),
      uses: Number(row.stat_value ?? 0),
    }));
  }
}

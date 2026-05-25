import "dotenv/config";

import { Elysia } from "elysia";

const PORT = Number(process.env.PORT ?? "8080");
const SHARED_SOURCE = "__manager__";
const STORM_WINDOW_MS = 30_000;
const BACKOFF_STEPS_MS = [60_000, 120_000, 300_000, 600_000];

type ReviverBackoffState = {
  botId: string;
  consecutiveFailures: number;
  lastFailureAt: number | null;
  nextAllowedAt: number;
  lastDispatchedAt: number | null;
  updatedAt: number;
};

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${process.env.D1_ACCOUNT_ID}/d1/database/${process.env.D1_DATABASE_ID}/query`;

function log(scope: string, message: string, payload?: unknown): void {
  const body = payload ? ` ${JSON.stringify(payload)}` : "";
  console.log(`[${new Date().toISOString()}] [${scope}] ${message}${body}`);
}

async function queryD1(sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.D1_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  const data = (await response.json()) as {
    success: boolean;
    result: Array<{ results?: Array<Record<string, unknown>> }>;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || !data.success) {
    throw new Error(data.errors?.[0]?.message ?? "D1 query failed");
  }

  return data.result[0]?.results ?? [];
}

async function getBackoffState(botId: string): Promise<ReviverBackoffState> {
  const rows = await queryD1("SELECT * FROM reviver_backoff WHERE bot_id = ?", [botId]);
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

async function saveBackoffState(state: ReviverBackoffState): Promise<void> {
  await queryD1(
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

async function recordRuntimeEvent(botId: string, eventType: string, level: string, payload?: unknown): Promise<void> {
  await queryD1(
    `
      INSERT INTO runtime_events (bot_id, event_type, level, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    [botId, eventType, level, payload ? JSON.stringify(payload) : null, Date.now()],
  );
}

async function dispatchWorkflow(): Promise<void> {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const workflow = process.env.GITHUB_WORKFLOW;
  const ref = process.env.GITHUB_REF ?? "main";

  if (!owner || !repo || !workflow || !process.env.GITHUB_PAT) {
    throw new Error("Missing GitHub workflow configuration.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref }),
    },
  );

  if (response.status !== 204) {
    throw new Error(`GitHub workflow dispatch failed with status ${response.status}: ${await response.text()}`);
  }
}

const app = new Elysia()
  .get("/health", async () => {
    const state = await getBackoffState(SHARED_SOURCE);
    return {
      status: "ok",
      now: Date.now(),
      backoff: state,
    };
  })
  .post("/revive", async ({ headers, body, set }) => {
    const authorization = headers.authorization;
    if (authorization !== `Bearer ${process.env.REVIVER_SECRET}`) {
      log("REVIVER", "Unauthorized revive attempt");
      set.status = 401;
      return { ok: false, error: "unauthorized" };
    }

    const source = typeof body === "object" && body && "source" in body && typeof body.source === "string"
      ? body.source
      : SHARED_SOURCE;
    const reason = typeof body === "object" && body && "reason" in body && typeof body.reason === "string"
      ? body.reason
      : "unspecified";
    const now = Date.now();
    const state = await getBackoffState(source);

    if (state.lastDispatchedAt && now - state.lastDispatchedAt < STORM_WINDOW_MS) {
      set.status = 429;
      return {
        ok: false,
        error: "revival_storm_blocked",
        retryAt: new Date(state.lastDispatchedAt + STORM_WINDOW_MS).toISOString(),
      };
    }

    if (state.nextAllowedAt > now) {
      set.status = 429;
      return {
        ok: false,
        error: "backoff_active",
        retryAt: new Date(state.nextAllowedAt).toISOString(),
      };
    }

    await dispatchWorkflow();

    const nextFailureCount = state.consecutiveFailures + 1;
    const delayMs = BACKOFF_STEPS_MS[Math.min(nextFailureCount - 1, BACKOFF_STEPS_MS.length - 1)];
    const updatedState: ReviverBackoffState = {
      botId: source,
      consecutiveFailures: nextFailureCount,
      lastFailureAt: now,
      nextAllowedAt: now + delayMs,
      lastDispatchedAt: now,
      updatedAt: now,
    };

    await saveBackoffState(updatedState);
    await recordRuntimeEvent(source, "revive_dispatched", "warn", {
      reason,
      nextAllowedAt: updatedState.nextAllowedAt,
      consecutiveFailures: updatedState.consecutiveFailures,
    });

    log("REVIVER", "Workflow dispatch accepted", {
      source,
      reason,
      nextAllowedAt: updatedState.nextAllowedAt,
      consecutiveFailures: updatedState.consecutiveFailures,
    });

    return {
      ok: true,
      source,
      reason,
      nextAllowedAt: new Date(updatedState.nextAllowedAt).toISOString(),
      consecutiveFailures: updatedState.consecutiveFailures,
    };
  });

app.listen(PORT);
log("REVIVER", "Reviver listening", { port: PORT });

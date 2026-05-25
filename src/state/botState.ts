export type BotRuntimeState = {
  sessionId: string;
  startedAt: number;
  restoredAt: number;
  guilds: number;
  restartCount: number;
  totalRestarts: number;
  commandUses: number;
  reconnectCount: number;
  heartbeatAt: number;
  lastAutosaveAt: number | null;
  latencyMs: number;
  lastError: string | null;
};

function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createFreshBotState(): BotRuntimeState {
  const now = Date.now();
  return {
    sessionId: newSessionId(),
    startedAt: now,
    restoredAt: now,
    guilds: 0,
    restartCount: 0,
    totalRestarts: 0,
    commandUses: 0,
    reconnectCount: 0,
    heartbeatAt: now,
    lastAutosaveAt: null,
    latencyMs: 0,
    lastError: null,
  };
}

export function restoreBotState(
  checkpoint: Partial<BotRuntimeState> | null | undefined,
): BotRuntimeState {
  const fresh = createFreshBotState();
  const restored = {
    ...fresh,
    ...checkpoint,
    restoredAt: Date.now(),
  };

  restored.restartCount = Number(checkpoint?.restartCount ?? 0) + 1;
  restored.lastError = checkpoint?.lastError ?? null;
  return restored;
}

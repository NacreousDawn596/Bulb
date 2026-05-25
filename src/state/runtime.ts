export const MANAGER_BOT_ID = "__manager__";

export type RuntimeSnapshot = {
  startedAt: number;
  uptimeMs: number;
  memoryRssMb: number;
  memoryHeapMb: number;
  enabledBots: number;
  connectedBots: number;
};

export function createRuntimeSnapshot(
  startedAt: number,
  enabledBots: number,
  connectedBots: number,
): RuntimeSnapshot {
  const memory = process.memoryUsage();

  return {
    startedAt,
    uptimeMs: Date.now() - startedAt,
    memoryRssMb: Math.round(memory.rss / 1024 / 1024),
    memoryHeapMb: Math.round(memory.heapUsed / 1024 / 1024),
    enabledBots,
    connectedBots,
  };
}

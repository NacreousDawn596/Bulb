import { readdir } from "node:fs/promises";
import path from "node:path";

import type { Logger } from "../services/logger";

export type BotConfig = {
  id: string;
  tokenEnv: string;
  prefix: string;
  enabled: boolean;
  displayName?: string;
  helloMessage?: string;
  startupDelayMs?: number;
  accent?: string;
  directory: string;
  commandsDirectory: string;
  token?: string;
};

const BOT_ROOT = path.resolve(process.cwd(), "bot");
const RESERVED_DIRECTORIES = new Set(["commands", "node_modules", "utils"]);

function envKey(botId: string, suffix: string): string {
  return `BOT_${botId.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}_${suffix}`;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return !["0", "false", "off", "no", ""].includes(value.trim().toLowerCase());
}

function readNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildBotConfig(directoryName: string, directory: string): BotConfig {
  const botId = directoryName;
  const tokenEnv = envKey(botId, "TOKEN");

  return {
    id: botId,
    tokenEnv,
    token: process.env[tokenEnv],
    prefix: process.env[envKey(botId, "PREFIX")] ?? "!",
    enabled: readBoolean(process.env[envKey(botId, "ENABLED")], true),
    displayName: process.env[envKey(botId, "DISPLAY_NAME")] ?? botId,
    helloMessage: process.env[envKey(botId, "HELLO_MESSAGE")],
    startupDelayMs: readNumber(process.env[envKey(botId, "STARTUP_DELAY_MS")]),
    accent: process.env[envKey(botId, "ACCENT")] ?? "default",
    directory,
    commandsDirectory: path.join(directory, "commands"),
  };
}

export async function discoverBots(logger?: Logger): Promise<BotConfig[]> {
  let entries;
  try {
    entries = await readdir(BOT_ROOT, { withFileTypes: true });
  } catch (error) {
    logger?.warn("Bot root directory is unavailable", {
      botRoot: BOT_ROOT,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  const directories = entries
    .filter((entry) => entry.isDirectory() && !RESERVED_DIRECTORIES.has(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const bots: BotConfig[] = [];
  const seenIds = new Set<string>();
  const seenTokenEnvs = new Set<string>();

  for (const directoryName of directories) {
    const directory = path.join(BOT_ROOT, directoryName);
    const config = buildBotConfig(directoryName, directory);

    if (seenIds.has(config.id)) {
      logger?.warn("Duplicate bot id skipped", {
        botId: config.id,
        directory,
      });
      continue;
    }

    if (seenTokenEnvs.has(config.tokenEnv)) {
      logger?.warn("Duplicate token env skipped", {
        botId: config.id,
        tokenEnv: config.tokenEnv,
        directory,
      });
      continue;
    }

    seenIds.add(config.id);
    seenTokenEnvs.add(config.tokenEnv);
    bots.push(config);
  }

  return bots;
}

export function botLayoutHint(): string {
  return "bot/<bot-name>/commands/*.ts plus BOT_<BOT_NAME>_* env vars";
}

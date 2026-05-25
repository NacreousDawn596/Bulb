import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { CommandInteraction, Message, PossiblyUncachedTextableChannel } from "eris";

import type { BotConfig } from "../../config/bots";
import type { D1Service, GuildConfig, UserLevelProfile } from "../../services/d1";
import type { Logger } from "../../services/logger";
import type { BotRuntimeState } from "../../state/botState";

export type CommandReply =
  | string
  | {
      content: string;
      ephemeral?: boolean;
    };

export type SlashCommandOptionChoice = {
  name: string;
  value: string | number;
};

export type SlashCommandOption = {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  choices?: SlashCommandOptionChoice[];
  options?: SlashCommandOption[];
  channel_types?: number[];
};

export type SlashCommandDefinition = {
  description: string;
  options?: SlashCommandOption[];
  default_member_permissions?: string | null;
  dm_permission?: boolean;
};

type CommandContextBase = {
  botId: string;
  commands: RuntimeCommandModule[];
  config: BotConfig;
  d1: D1Service;
  logger: Logger;
  state: BotRuntimeState;
};

export type RuntimeMessageCommandContext = CommandContextBase & {
  args: string[];
  message: Message<PossiblyUncachedTextableChannel>;
  rawArgs: string;
  reply: (content: CommandReply) => Promise<void>;
};

type InteractionOption = {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: InteractionOption[];
};

export type RuntimeSlashCommandContext = CommandContextBase & {
  interaction: CommandInteraction;
  rawOptions: InteractionOption[];
  reply: (content: CommandReply) => Promise<void>;
  getSubcommand: () => string | null;
  getString: (name: string, required?: boolean) => string | null;
  getBoolean: (name: string, required?: boolean) => boolean | null;
  getUserId: (name: string, required?: boolean) => string | null;
  getChannelId: (name: string, required?: boolean) => string | null;
  getGuildId: () => string | null;
};

export type RuntimeCommandModule = {
  aliases?: string[];
  description: string;
  executeMessage?: (context: RuntimeMessageCommandContext) => Promise<void>;
  executeSlash?: (context: RuntimeSlashCommandContext) => Promise<void>;
  message?: {
    enabled?: boolean;
  };
  name: string;
  slash?: false | SlashCommandDefinition;
};

async function importCommandModule(filePath: string): Promise<RuntimeCommandModule> {
  const module = await import(pathToFileUrl(filePath));
  const command = (module.default ?? module) as Partial<RuntimeCommandModule>;

  if (!command.name || typeof command.description !== "string") {
    throw new Error(`Command ${filePath} must export { name, description, ... }`);
  }

  if (typeof command.executeMessage !== "function" && typeof command.executeSlash !== "function") {
    throw new Error(`Command ${filePath} must export executeMessage and/or executeSlash`);
  }

  return command as RuntimeCommandModule;
}

function pathToFileUrl(filePath: string): string {
  return pathToFileURL(filePath).href;
}

function isCommandFile(fileName: string): boolean {
  return fileName.endsWith(".ts") || fileName.endsWith(".js") || fileName.endsWith(".mjs");
}

function normalizeCommand(command: RuntimeCommandModule): RuntimeCommandModule {
  return {
    ...command,
    aliases: (command.aliases ?? []).map((alias) => alias.toLowerCase()),
    name: command.name.toLowerCase(),
  };
}

export function buildSlashCommandPayloads(commands: RuntimeCommandModule[]): Array<Record<string, unknown>> {
  return commands
    .filter((command) => command.slash !== false && command.executeSlash)
    .map((command) => {
      const slash = command.slash === false ? undefined : command.slash;
      return {
      name: command.name,
      description: slash?.description ?? command.description,
      options: slash?.options ?? [],
      type: 1,
      default_member_permissions: slash?.default_member_permissions ?? null,
      dm_permission: slash?.dm_permission ?? false,
    };
    });
}

export async function loadBotCommands(
  commandsDirectory: string,
  logger: Logger,
): Promise<Map<string, RuntimeCommandModule>> {
  const commands = new Map<string, RuntimeCommandModule>();
  let entries;
  try {
    entries = await readdir(commandsDirectory, { withFileTypes: true });
  } catch {
    logger.warn("Commands directory missing", { commandsDirectory });
    return commands;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !isCommandFile(entry.name)) {
      continue;
    }

    const filePath = path.join(commandsDirectory, entry.name);
    try {
      const loaded = normalizeCommand(await importCommandModule(filePath));
      commands.set(loaded.name, loaded);

      for (const alias of loaded.aliases ?? []) {
        if (!commands.has(alias)) {
          commands.set(alias, loaded);
        }
      }
    } catch (error) {
      logger.warn("Command skipped because it is incompatible", {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info("Loaded bot commands", {
    commandsDirectory,
    commands: Array.from(new Set(Array.from(commands.values()).map((command) => command.name))).sort(),
  });
  return commands;
}

function getActiveOptionBranch(options: InteractionOption[]): InteractionOption[] {
  const subcommand = options.find((option) => option.type === 1);
  if (!subcommand) {
    return options;
  }

  return subcommand.options ?? [];
}

function findOption(options: InteractionOption[], name: string): InteractionOption | undefined {
  return getActiveOptionBranch(options).find((option) => option.name === name);
}

export function createSlashOptionAccessors(interaction: CommandInteraction) {
  const rawOptions = ((interaction.data as { options?: InteractionOption[] }).options ?? []) as InteractionOption[];

  return {
    rawOptions,
    getSubcommand(): string | null {
      return rawOptions.find((option) => option.type === 1)?.name ?? null;
    },
    getString(name: string, required = false): string | null {
      const option = findOption(rawOptions, name);
      if (option && typeof option.value === "string") {
        return option.value;
      }
      if (required) {
        throw new Error(`Missing required string option: ${name}`);
      }
      return null;
    },
    getBoolean(name: string, required = false): boolean | null {
      const option = findOption(rawOptions, name);
      if (option && typeof option.value === "boolean") {
        return option.value;
      }
      if (required) {
        throw new Error(`Missing required boolean option: ${name}`);
      }
      return null;
    },
    getUserId(name: string, required = false): string | null {
      const option = findOption(rawOptions, name);
      if (option && typeof option.value === "string") {
        return option.value;
      }
      if (required) {
        throw new Error(`Missing required user option: ${name}`);
      }
      return null;
    },
    getChannelId(name: string, required = false): string | null {
      const option = findOption(rawOptions, name);
      if (option && typeof option.value === "string") {
        return option.value;
      }
      if (required) {
        throw new Error(`Missing required channel option: ${name}`);
      }
      return null;
    },
    getGuildId(): string | null {
      return interaction.guildID ?? null;
    },
  };
}

export const DEFAULT_GUILD_CONFIG: GuildConfig = {
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

export function levelProgress(profile: UserLevelProfile): { needed: number; nextLevel: number } {
  const nextLevel = profile.level + 1;
  const nextLevelTotalXp = Math.pow((nextLevel - 1) / 0.1, 2);
  return {
    nextLevel,
    needed: Math.max(0, Math.ceil(nextLevelTotalXp - profile.totalXp)),
  };
}

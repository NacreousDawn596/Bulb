import { Client, Constants, Guild, Message } from "eris";

import { BotConfig } from "../../config/bots";
import { D1Service } from "../../services/d1";
import { Logger } from "../../services/logger";
import { CheckpointService } from "../../services/checkpoint";
import { BotRuntimeState, restoreBotState } from "../../state/botState";
import {
  buildSlashCommandPayloads,
  createSlashOptionAccessors,
  loadBotCommands,
  RuntimeCommandModule,
} from "./commands";

type RuntimeBotDependencies = {
  d1: D1Service;
  checkpointService: CheckpointService;
  logger: Logger;
};

export class RuntimeBot {
  readonly client: Client;
  state: BotRuntimeState = restoreBotState(null);
  private ready = false;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;
  private identityAccent: string;
  private readonly commands = new Map<string, RuntimeCommandModule>();
  private eventsBound = false;

  constructor(
    readonly config: BotConfig,
    private readonly dependencies: RuntimeBotDependencies,
  ) {
    this.identityAccent = config.accent ?? "default";
    this.client = new Client(config.token ?? "", {
      intents: [
        Constants.Intents.guilds,
        Constants.Intents.guildMembers,
        Constants.Intents.guildMessages,
        Constants.Intents.messageContent,
      ],
      autoreconnect: true,
      maxShards: "auto",
      messageLimit: 0,
      restMode: true,
      disableEvents: {
        TYPING_START: true,
        PRESENCE_UPDATE: true,
      },
    });
  }

  async restore(): Promise<void> {
    this.commands.clear();
    const loadedCommands = await loadBotCommands(this.config.commandsDirectory, this.dependencies.logger);
    for (const [name, command] of loadedCommands) {
      this.commands.set(name, command);
    }

    if (this.commands.size === 0) {
      this.dependencies.logger.warn("Bot has no compatible commands", {
        botId: this.config.id,
        commandsDirectory: this.config.commandsDirectory,
      });
    }

    const checkpoint = await this.dependencies.checkpointService.load(this.config.id);
    this.state = restoreBotState(checkpoint);
    this.state.totalRestarts = await this.dependencies.d1.incrementTotalRestarts(this.config.id);
    await this.dependencies.d1.upsertBot(this.config, this.state);
    await this.dependencies.d1.recordRuntimeEvent(this.config.id, "restore", "info", {
      checkpointFound: Boolean(checkpoint),
      accent: this.identityAccent,
      commandCount: this.commands.size,
      restartCount: this.state.restartCount,
      totalRestarts: this.state.totalRestarts,
    });
  }

  async connect(): Promise<void> {
    if (!this.eventsBound) {
      this.bindEvents();
      this.eventsBound = true;
    }
    await this.client.connect();
  }

  startAutosave(intervalMs: number): void {
    this.stopAutosave();
    this.autosaveTimer = setInterval(() => {
      void this.saveCheckpoint("autosave");
    }, intervalMs);
  }

  stopAutosave(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  async shutdown(reason: string): Promise<void> {
    this.stopAutosave();
    await this.saveCheckpoint(reason);
    this.client.disconnect({
      reconnect: false,
    });
    await this.dependencies.d1.recordRuntimeEvent(this.config.id, "shutdown", "info", { reason });
  }

  async saveCheckpoint(reason: string): Promise<void> {
    this.refreshDerivedState();
    await this.dependencies.checkpointService.save(this.config.id, this.state);
    await this.dependencies.d1.setStat(this.config.id, "last_checkpoint_reason", reason);
  }

  getHealth(): Record<string, unknown> {
    this.refreshDerivedState();
    return {
      botId: this.config.id,
      displayName: this.config.displayName ?? this.config.id,
      ready: this.ready,
      guilds: this.state.guilds,
      uptimeMs: Date.now() - this.state.startedAt,
      restartCount: this.state.restartCount,
      totalRestarts: this.state.totalRestarts,
      commandUses: this.state.commandUses,
      reconnectCount: this.state.reconnectCount,
      heartbeatAt: this.state.heartbeatAt,
      latencyMs: this.state.latencyMs,
    };
  }

  private listPrimaryCommands(): RuntimeCommandModule[] {
    return Array.from(new Map(Array.from(this.commands.values()).map((command) => [command.name, command])).values());
  }

  private bindEvents(): void {
    this.client.on("ready", async () => {
      this.ready = true;
      this.refreshDerivedState();
      await this.syncSlashCommands();
      await this.dependencies.d1.syncGuilds(this.config.id, this.getGuildRows());
      await this.dependencies.d1.recordRuntimeEvent(this.config.id, "ready", "info", {
        accent: this.identityAccent,
        commandCount: this.commands.size,
        guilds: this.state.guilds,
      });
      this.dependencies.logger.info("Bot connected", this.getHealth());
    });

    this.client.on("error", async (error) => {
      this.state.lastError = error.message;
      this.dependencies.logger.error("Bot error", { error: error.message });
      await this.dependencies.d1.recordRuntimeEvent(this.config.id, "error", "error", {
        error: error.message,
      });
    });

    this.client.on("warn", (message) => {
      this.dependencies.logger.warn("Eris warning", { message });
    });

    this.client.on("shardResume", async () => {
      this.state.reconnectCount += 1;
      await this.dependencies.d1.recordRuntimeEvent(this.config.id, "shard_resume", "warn", {
        reconnectCount: this.state.reconnectCount,
      });
    });

    this.client.on("disconnect", async () => {
      this.ready = false;
      this.state.reconnectCount += 1;
      await this.dependencies.d1.recordRuntimeEvent(this.config.id, "disconnect", "warn", {
        reconnectCount: this.state.reconnectCount,
      });
    });

    this.client.on("guildCreate", async (guild: Guild) => {
      this.state.guilds = this.client.guilds.size;
      await this.dependencies.d1.syncGuilds(this.config.id, this.getGuildRows());
      await this.dependencies.d1.recordRuntimeEvent(this.config.id, "guild_join", "info", {
        guildId: guild.id,
        guildName: guild.name,
      });
    });

    this.client.on("guildDelete", async (guild: Guild) => {
      this.state.guilds = this.client.guilds.size;
      await this.dependencies.d1.syncGuilds(this.config.id, this.getGuildRows());
      await this.dependencies.d1.recordRuntimeEvent(this.config.id, "guild_leave", "warn", {
        guildId: guild.id,
        guildName: guild.name,
      });
    });

    this.client.on("messageCreate", async (message: Message) => {
      await this.handleMessage(message);
      await this.handleLeveling(message);
    });

    this.client.on("interactionCreate", async (interaction) => {
      await this.handleInteraction(interaction as never);
    });

    this.client.on("guildMemberAdd", async (guild, member) => {
      await this.handleGuildMemberAdd(guild as Guild, member as { id: string });
    });

    this.client.on("guildMemberRemove", async (guild, member) => {
      await this.handleGuildMemberRemove(guild as Guild, member as { id: string });
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    if (!message.guildID || message.author.bot) {
      return;
    }

    const content = message.content.trim();
    if (!content.startsWith(this.config.prefix)) {
      return;
    }

    const withoutPrefix = content.slice(this.config.prefix.length).trim();
    if (!withoutPrefix) {
      return;
    }

    const [rawCommandName = "", ...args] = withoutPrefix.split(/\s+/);
    const commandName = rawCommandName.toLowerCase();
    const command = this.commands.get(commandName);
    if (!command?.executeMessage) {
      return;
    }

    try {
      await this.recordCommandUse(command.name, {
        channelId: message.channel.id,
        commandKind: "message",
        guildId: message.guildID,
      });
      await command.executeMessage({
        args,
        botId: this.config.id,
        commands: this.listPrimaryCommands(),
        config: this.config,
        d1: this.dependencies.d1,
        logger: this.dependencies.logger,
        message,
        rawArgs: withoutPrefix.slice(rawCommandName.length).trim(),
        reply: async (response) => {
          await this.replyToMessageCommand(message, response);
        },
        state: this.state,
      });
    } catch (error) {
      this.dependencies.logger.error("Command failed", {
        commandName: command.name,
        error: error instanceof Error ? error.message : String(error),
      });
      await message.channel.createMessage(`Command \`${command.name}\` failed.`);
    }
  }

  private async handleInteraction(interaction: {
    createMessage: (payload: Record<string, unknown>) => Promise<unknown>;
    data?: { name?: string };
    guildID?: string;
    id: string;
    member?: { permissions?: bigint | string | { has: (permission: bigint | number) => boolean } };
    type?: number;
    user?: { id: string; mention?: string };
  }): Promise<void> {
    if (interaction.type !== 2) {
      return;
    }

    const commandName = interaction.data?.name?.toLowerCase();
    if (!commandName) {
      return;
    }

    const command = this.commands.get(commandName);
    if (!command?.executeSlash) {
      return;
    }

    try {
      await this.recordCommandUse(command.name, {
        channelId: null,
        commandKind: "slash",
        guildId: interaction.guildID ?? null,
      });

      const accessors = createSlashOptionAccessors(interaction as never);
      await command.executeSlash({
        botId: this.config.id,
        commands: this.listPrimaryCommands(),
        config: this.config,
        d1: this.dependencies.d1,
        getBoolean: accessors.getBoolean,
        getChannelId: accessors.getChannelId,
        getGuildId: accessors.getGuildId,
        getString: accessors.getString,
        getSubcommand: accessors.getSubcommand,
        getUserId: accessors.getUserId,
        interaction: interaction as never,
        logger: this.dependencies.logger,
        rawOptions: accessors.rawOptions,
        reply: async (response) => {
          await this.replyToInteraction(interaction, response);
        },
        state: this.state,
      });
    } catch (error) {
      this.dependencies.logger.error("Slash command failed", {
        commandName,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.replyToInteraction(interaction, {
        content: `Command \`${commandName}\` failed.`,
        ephemeral: true,
      });
    }
  }

  private async syncSlashCommands(): Promise<void> {
    const payloads = buildSlashCommandPayloads(this.listPrimaryCommands());
    const slashClient = this.client as unknown as {
      bulkEditCommands: (commands: Array<Record<string, unknown>>) => Promise<unknown>;
    };
    await slashClient.bulkEditCommands(payloads);
    this.dependencies.logger.info("Slash commands synced", {
      botId: this.config.id,
      commands: payloads.map((command) => command.name),
    });
  }

  private async replyToMessageCommand(message: Message, response: string | { content: string }): Promise<void> {
    await message.channel.createMessage(typeof response === "string" ? response : response.content);
  }

  private async replyToInteraction(
    interaction: { createMessage: (payload: Record<string, unknown>) => Promise<unknown> },
    response: string | { content: string; ephemeral?: boolean },
  ): Promise<void> {
    if (typeof response === "string") {
      await interaction.createMessage({ content: response });
      return;
    }

    await interaction.createMessage({
      content: response.content,
      flags: response.ephemeral ? 64 : 0,
    });
  }

  private async recordCommandUse(
    commandName: string,
    meta: { channelId: string | null; commandKind: "message" | "slash"; guildId: string | null },
  ): Promise<void> {
    this.state.commandUses += 1;
    this.state.heartbeatAt = Date.now();
    await this.dependencies.d1.setStat(this.config.id, "command_uses", String(this.state.commandUses));
    await this.dependencies.d1.addCommandUse(this.config.id, commandName);
    await this.dependencies.d1.recordRuntimeEvent(this.config.id, "command_run", "info", {
      accent: this.identityAccent,
      channelId: meta.channelId,
      commandKind: meta.commandKind,
      commandName,
      guildId: meta.guildId,
    });
  }

  private async handleLeveling(message: Message): Promise<void> {
    if (!message.guildID || message.author.bot) {
      return;
    }

    try {
      const config = await this.dependencies.d1.getGuildConfig(this.config.id, message.guildID);
      if (!config.modules.level.enabled) {
        return;
      }

      const xpGain = Math.floor(Math.random() * 11) + 15;
      const result = await this.dependencies.d1.addXp(this.config.id, message.guildID, message.author.id, xpGain, 60_000);

      if (result.awarded && result.leveledUp) {
        await message.channel.createMessage(
          `🎉 <@${message.author.id}> reached level **${result.level}** with **${result.totalXp} XP**!`,
        );
      }
    } catch (error) {
      this.dependencies.logger.error("Level handler failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleGuildMemberAdd(guild: Guild, member: { id: string }): Promise<void> {
    try {
      const config = await this.dependencies.d1.getGuildConfig(this.config.id, guild.id);
      const welcome = config.modules.welcome;
      if (!welcome.enabled || !welcome.channelId) {
        return;
      }

      const channel = guild.channels.get(welcome.channelId);
      if (!channel || !("createMessage" in channel)) {
        return;
      }

      const text = (welcome.message || "Welcome {user} to {server}!")
        .replaceAll("{user}", `<@${member.id}>`)
        .replaceAll("{server}", guild.name);

      await channel.createMessage(text);
    } catch (error) {
      this.dependencies.logger.error("Welcome handler failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleGuildMemberRemove(guild: Guild, member: { id: string }): Promise<void> {
    try {
      const config = await this.dependencies.d1.getGuildConfig(this.config.id, guild.id);
      const goodbye = config.modules.goodbye;
      if (!goodbye.enabled || !goodbye.channelId) {
        return;
      }

      const channel = guild.channels.get(goodbye.channelId);
      if (!channel || !("createMessage" in channel)) {
        return;
      }

      const text = (goodbye.message || "Goodbye {user}.")
        .replaceAll("{user}", `<@${member.id}>`)
        .replaceAll("{server}", guild.name);

      await channel.createMessage(text);
    } catch (error) {
      this.dependencies.logger.error("Goodbye handler failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getGuildRows(): Array<{ id: string; name: string }> {
    return this.client.guilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
    }));
  }

  private refreshDerivedState(): void {
    this.state.guilds = this.client.guilds.size;
    this.state.heartbeatAt = Date.now();
    this.state.lastAutosaveAt = Date.now();
    this.state.latencyMs = this.client.shards.size
      ? Math.round(
          this.client.shards.reduce((sum, shard) => sum + (shard.latency ?? 0), 0) / this.client.shards.size,
        )
      : 0;
  }
}

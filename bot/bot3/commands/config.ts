import type { RuntimeCommandModule } from "../../../src/bots/shared/commands";
import type { GuildConfig } from "../../../src/services/d1";

const FEATURE_NAMES = new Set(["level", "welcome", "goodbye"]);
const MANAGE_GUILD_BIT = 32n;

function hasManageGuildPermission(value: unknown): boolean {
  if (typeof value === "bigint") {
    return (value & MANAGE_GUILD_BIT) === MANAGE_GUILD_BIT;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = BigInt(value);
    return (parsed & MANAGE_GUILD_BIT) === MANAGE_GUILD_BIT;
  }

  if (value && typeof value === "object" && "allow" in (value as Record<string, unknown>)) {
    return hasManageGuildPermission((value as Record<string, unknown>).allow);
  }

  if (value && typeof value === "object" && "has" in (value as Record<string, unknown>)) {
    const hasFn = (value as { has?: (permission: bigint | number) => boolean }).has;
    if (typeof hasFn === "function") {
      return hasFn(Number(MANAGE_GUILD_BIT));
    }
  }

  return false;
}

function parseBooleanWord(input: string | null): boolean | null {
  if (!input) {
    return null;
  }

  const normalized = input.trim().toLowerCase();
  if (["true", "on", "yes", "enable", "enabled"].includes(normalized)) {
    return true;
  }
  if (["false", "off", "no", "disable", "disabled"].includes(normalized)) {
    return false;
  }
  return null;
}

function parseChannelId(input: string | null): string | null {
  if (!input) {
    return null;
  }

  const match = input.match(/^<#(\d+)>$/);
  if (match) {
    return match[1];
  }

  return /^\d+$/.test(input) ? input : null;
}

function renderConfig(config: GuildConfig): string {
  const { level, welcome, goodbye } = config.modules;
  return [
    "⚙️ Guild Config",
    `Level XP: ${level.enabled ? "enabled" : "disabled"}`,
    `Welcome: ${welcome.enabled ? "enabled" : "disabled"} • channel: ${welcome.channelId ? `<#${welcome.channelId}>` : "not set"}`,
    `Goodbye: ${goodbye.enabled ? "enabled" : "disabled"} • channel: ${goodbye.channelId ? `<#${goodbye.channelId}>` : "not set"}`,
  ].join("\n");
}

const command: RuntimeCommandModule = {
  name: "config",
  description: "Configure guild modules.",
  slash: {
    description: "Configure guild modules.",
    dm_permission: false,
    default_member_permissions: "32",
    options: [
      {
        type: 1,
        name: "show",
        description: "Show current guild configuration.",
      },
      {
        type: 1,
        name: "toggle",
        description: "Enable or disable a module.",
        options: [
          {
            type: 3,
            name: "feature",
            description: "Feature name",
            required: true,
            choices: [
              { name: "Level XP", value: "level" },
              { name: "Welcome Messages", value: "welcome" },
              { name: "Goodbye Messages", value: "goodbye" },
            ],
          },
          {
            type: 5,
            name: "enabled",
            description: "Enable or disable this feature",
            required: true,
          },
        ],
      },
      {
        type: 1,
        name: "welcome",
        description: "Set welcome channel/message.",
        options: [
          {
            type: 7,
            name: "channel",
            description: "Target text channel",
            required: true,
            channel_types: [0],
          },
          {
            type: 3,
            name: "message",
            description: "Template supports {user} and {server}",
            required: true,
          },
        ],
      },
      {
        type: 1,
        name: "goodbye",
        description: "Set goodbye channel/message.",
        options: [
          {
            type: 7,
            name: "channel",
            description: "Target text channel",
            required: true,
            channel_types: [0],
          },
          {
            type: 3,
            name: "message",
            description: "Template supports {user} and {server}",
            required: true,
          },
        ],
      },
    ],
  },
  async executeMessage({ botId, config, d1, message, args, rawArgs, reply }) {
    if (!message.guildID) {
      await reply("This command only works in a server.");
      return;
    }
    if (!hasManageGuildPermission(message.member?.permissions)) {
      await reply("You need Manage Server permission to use this.");
      return;
    }

    const subcommand = (args[0] ?? "").toLowerCase();
    const current = await d1.getGuildConfig(botId, message.guildID);

    if (subcommand === "show") {
      await reply(renderConfig(current));
      return;
    }

    if (subcommand === "toggle") {
      const feature = (args[1] ?? "").toLowerCase();
      const enabled = parseBooleanWord(args[2] ?? null);
      if (!FEATURE_NAMES.has(feature) || enabled === null) {
        await reply(`usage: ${config.prefix}config toggle <level|welcome|goodbye> <on|off>`);
        return;
      }

      current.modules[feature as "level" | "welcome" | "goodbye"].enabled = enabled;
      await d1.setGuildConfig(botId, message.guildID, current);
      await reply(`Updated ${feature}: ${enabled ? "enabled" : "disabled"}.`);
      return;
    }

    if (subcommand === "welcome" || subcommand === "goodbye") {
      const channelId = parseChannelId(args[1] ?? null);
      const messageText = rawArgs.split(/\s+/).slice(2).join(" ").trim();
      if (!channelId || !messageText) {
        await reply(`usage: ${config.prefix}config ${subcommand} <#channel|channel_id> <message>`);
        return;
      }

      current.modules[subcommand].channelId = channelId;
      current.modules[subcommand].message = messageText;
      current.modules[subcommand].enabled = true;
      await d1.setGuildConfig(botId, message.guildID, current);
      await reply(`${subcommand} configuration updated and enabled.`);
      return;
    }

    await reply(
      [
        `usage: ${config.prefix}config show`,
        `usage: ${config.prefix}config toggle <level|welcome|goodbye> <on|off>`,
        `usage: ${config.prefix}config welcome <#channel|channel_id> <message>`,
        `usage: ${config.prefix}config goodbye <#channel|channel_id> <message>`,
      ].join("\n"),
    );
  },
  async executeSlash({ botId, d1, getBoolean, getChannelId, getGuildId, getString, getSubcommand, interaction, reply }) {
    const guildId = getGuildId();
    if (!guildId) {
      await reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    if (!hasManageGuildPermission(interaction.member?.permissions)) {
      await reply({ content: "You need Manage Server permission to use this.", ephemeral: true });
      return;
    }

    const subcommand = getSubcommand();
    const current = await d1.getGuildConfig(botId, guildId);

    if (subcommand === "show") {
      await reply({ content: renderConfig(current), ephemeral: true });
      return;
    }

    if (subcommand === "toggle") {
      const feature = getString("feature", true)?.toLowerCase() ?? "";
      const enabled = getBoolean("enabled", true);
      if (!FEATURE_NAMES.has(feature) || enabled === null) {
        await reply({ content: "Invalid toggle request.", ephemeral: true });
        return;
      }

      current.modules[feature as "level" | "welcome" | "goodbye"].enabled = enabled;
      await d1.setGuildConfig(botId, guildId, current);
      await reply({ content: `Updated ${feature}: ${enabled ? "enabled" : "disabled"}.`, ephemeral: true });
      return;
    }

    if (subcommand === "welcome" || subcommand === "goodbye") {
      const channelId = getChannelId("channel", true);
      const messageText = getString("message", true);
      if (!channelId || !messageText) {
        await reply({ content: "Missing channel or message.", ephemeral: true });
        return;
      }

      current.modules[subcommand].channelId = channelId;
      current.modules[subcommand].message = messageText;
      current.modules[subcommand].enabled = true;
      await d1.setGuildConfig(botId, guildId, current);
      await reply({ content: `${subcommand} configuration updated and enabled.`, ephemeral: true });
      return;
    }

    await reply({ content: "Unknown config subcommand.", ephemeral: true });
  },
};

export default command;

import type { RuntimeCommandModule } from "../../../src/bots/shared/commands";
import { levelProgress } from "../../../src/bots/shared/commands";

function extractMentionOrId(input: string | null): string | null {
  if (!input) {
    return null;
  }

  const mention = input.match(/^<@!?(\d+)>$/);
  if (mention) {
    return mention[1];
  }

  return /^\d+$/.test(input) ? input : null;
}

async function renderProfile(botId: string, guildId: string | null, userId: string | null, d1: any) {
  if (!guildId) {
    return "This command only works in a server.";
  }

  if (!userId) {
    return "No user provided.";
  }

  const profile = await d1.getUserLevel(botId, guildId, userId);
  const progress = levelProgress(profile);
  return [
    `🏆 XP Profile for <@${userId}>`,
    `Level: ${profile.level}`,
    `Total XP: ${profile.totalXp}`,
    `XP to next level: ${progress.needed}`,
  ].join("\n");
}

const command: RuntimeCommandModule = {
  name: "xp",
  description: "Show XP and level for a user.",
  slash: {
    description: "Show XP and level for a user.",
    dm_permission: false,
    options: [
      {
        type: 6,
        name: "user",
        description: "Target user (defaults to you)",
        required: false,
      },
    ],
  },
  async executeMessage({ botId, d1, message, rawArgs, reply }) {
    const targetId = extractMentionOrId(rawArgs.trim()) ?? message.author.id;
    await reply(await renderProfile(botId, message.guildID, targetId, d1));
  },
  async executeSlash({ botId, d1, getGuildId, getUserId, interaction, reply }) {
    const targetId = getUserId("user") ?? interaction.user.id;
    await reply({
      content: await renderProfile(botId, getGuildId(), targetId, d1),
      ephemeral: true,
    });
  },
};

export default command;

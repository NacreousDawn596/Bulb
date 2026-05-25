import type { RuntimeCommandModule } from "../../../src/bots/shared/commands";

async function renderLeaderboard(botId: string, guildId: string | null, d1: RuntimeCommandModule extends never ? never : any) {
  if (!guildId) {
    return "This command only works in a server.";
  }

  const top = await d1.getLeaderboard(botId, guildId, 10);
  if (!top.length) {
    return "No XP data yet. Send messages to start earning XP.";
  }

  const lines = top.map(
    (row: { level: number; total_xp: number; user_id: string }, index: number) =>
      `${index + 1}. <@${row.user_id}> • Level ${row.level} • ${row.total_xp} XP`,
  );
  return `📈 XP Leaderboard\n${lines.join("\n")}`;
}

const command: RuntimeCommandModule = {
  name: "leaderboard",
  description: "Show top users by XP in this server.",
  slash: {
    description: "Show top users by XP in this server.",
    dm_permission: false,
  },
  async executeMessage({ botId, d1, message, reply }) {
    await reply(await renderLeaderboard(botId, message.guildID, d1));
  },
  async executeSlash({ botId, d1, getGuildId, reply }) {
    await reply(await renderLeaderboard(botId, getGuildId(), d1));
  },
};

export default command;

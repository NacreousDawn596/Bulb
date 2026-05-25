/**
 * botinfo.js - Runtime bot information
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Show runtime info and top command stats.'),
  async execute(interaction, state, d1) {
    const uptimeSec = Math.floor((Date.now() - state.bootTime) / 1000);
    const topCommands = await d1.getTopCommands(5);
    const lines = topCommands.length
      ? topCommands.map((row, index) => `${index + 1}. ${row.command}: ${row.uses}`).join('\n')
      : 'No command usage yet.';

    await interaction.reply({
      content: [
        `🤖 Session ID: **${state.sessionId}**`,
        `⏱️ Uptime: **${uptimeSec}s**`,
        `🏠 Guilds: **${interaction.client.guilds.cache.size}**`,
        `🔁 Lifetime Restarts: **${state.totalRestarts}**`,
        '📊 Top Commands:',
        lines,
      ].join('\n'),
    });
  },
};

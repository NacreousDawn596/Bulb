/**
 * leaderboard.js - Server XP leaderboard
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show top users by XP in this server.'),
  async execute(interaction, _state, d1) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
      return;
    }

    const top = await d1.getLeaderboard(interaction.guildId, 10);
    if (!top.length) {
      await interaction.reply('No XP data yet. Send messages to start earning XP.');
      return;
    }

    const lines = top.map((row, index) => {
      const userMention = `<@${row.user_id}>`;
      return `${index + 1}. ${userMention} • Level ${row.level} • ${row.total_xp} XP`;
    });

    await interaction.reply(`📈 **XP Leaderboard**\n${lines.join('\n')}`);
  },
};

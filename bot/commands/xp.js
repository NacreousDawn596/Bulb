/**
 * xp.js - Show a user's XP profile
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('xp')
    .setDescription('Show XP and level for a user.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Target user (defaults to you)')
        .setRequired(false),
    ),
  async execute(interaction, _state, d1) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
      return;
    }

    const user = interaction.options.getUser('user') || interaction.user;
    const profile = await d1.getUserLevel(interaction.guildId, user.id);
    const nextLevel = profile.level + 1;
    const nextLevelTotalXp = Math.pow((nextLevel - 1) / 0.1, 2);
    const needed = Math.max(0, Math.ceil(nextLevelTotalXp - profile.totalXp));

    await interaction.reply({
      content: [
        `🏆 XP Profile for ${user}`,
        `Level: **${profile.level}**`,
        `Total XP: **${profile.totalXp}**`,
        `XP to next level: **${needed}**`,
      ].join('\n'),
    });
  },
};

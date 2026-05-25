/**
 * cat.js - Random cat image
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cat')
    .setDescription('Get a random cat image.'),
  async execute(interaction) {
    await interaction.reply({ content: 'Fetching cat...', ephemeral: true });

    try {
      const response = await fetch('https://cataas.com/cat?json=true');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const catUrl = `https://cataas.com${data.url}`;
      await interaction.editReply({ content: catUrl });
    } catch (error) {
      console.error('cat command failed:', error);
      await interaction.editReply('Failed to fetch cat image. Try again.');
    }
  },
};

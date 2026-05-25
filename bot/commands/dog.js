/**
 * dog.js - Random dog image
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dog')
    .setDescription('Get a random dog image.'),
  async execute(interaction) {
    await interaction.reply({ content: 'Fetching dog...', ephemeral: true });

    try {
      const response = await fetch('https://dog.ceo/api/breeds/image/random');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      await interaction.editReply({ content: data.message });
    } catch (error) {
      console.error('dog command failed:', error);
      await interaction.editReply('Failed to fetch dog image. Try again.');
    }
  },
};

/**
 * help.js - List registered slash commands
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List available commands.'),
  async execute(interaction) {
    const names = [...interaction.client.commands.keys()].sort();
    const output = names.length ? names.map(name => `• /${name}`).join('\n') : 'No commands loaded.';

    await interaction.reply({
      content: `📚 Available commands:\n${output}`,
      ephemeral: true,
    });
  },
};

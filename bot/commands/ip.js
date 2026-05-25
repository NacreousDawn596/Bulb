/**
 * ip.js - IP information lookup
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Lookup rough geo/network info for an IP.')
    .addStringOption(option =>
      option
        .setName('query')
        .setDescription('IPv4, IPv6, or hostname')
        .setRequired(true),
    ),
  async execute(interaction) {
    const query = interaction.options.getString('query', true).trim();
    await interaction.reply({ content: `Looking up \`${query}\`...`, ephemeral: true });

    try {
      const response = await fetch(`https://ipinfo.io/${encodeURIComponent(query)}/json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (data.bogon) {
        await interaction.editReply('This is a bogon/private address with no public geolocation.');
        return;
      }

      const lines = [
        `IP: **${data.ip || query}**`,
        `City: **${data.city || 'Unknown'}**`,
        `Region: **${data.region || 'Unknown'}**`,
        `Country: **${data.country || 'Unknown'}**`,
        `Org: **${data.org || 'Unknown'}**`,
        `Timezone: **${data.timezone || 'Unknown'}**`,
      ];
      await interaction.editReply(lines.join('\n'));
    } catch (error) {
      console.error('ip command failed:', error);
      await interaction.editReply('Failed to resolve IP info.');
    }
  },
};

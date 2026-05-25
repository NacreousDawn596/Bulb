/**
 * config.js - Guild feature configuration
 */

const { SlashCommandBuilder, ChannelType } = require('discord.js');

const FEATURE_CHOICES = [
  { name: 'Level XP', value: 'level' },
  { name: 'Welcome Messages', value: 'welcome' },
  { name: 'Goodbye Messages', value: 'goodbye' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure guild modules.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('Show current guild configuration.'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Enable or disable a module.')
        .addStringOption(option =>
          option
            .setName('feature')
            .setDescription('Feature name')
            .setRequired(true)
            .addChoices(...FEATURE_CHOICES),
        )
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable or disable this feature')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('welcome')
        .setDescription('Set welcome channel/message.')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Target text channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName('message')
            .setDescription('Template supports {user} and {server}')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('goodbye')
        .setDescription('Set goodbye channel/message.')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Target text channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName('message')
            .setDescription('Template supports {user} and {server}')
            .setRequired(true),
        ),
    ),
  async execute(interaction, _state, d1) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
      return;
    }
    if (!interaction.memberPermissions?.has('ManageGuild')) {
      await interaction.reply({ content: 'You need Manage Server permission to use this.', ephemeral: true });
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);
    const config = await d1.getGuildConfig(interaction.guildId);

    if (subcommand === 'show') {
      const { level, welcome, goodbye } = config.modules;
      await interaction.reply({
        content: [
          '⚙️ **Guild Config**',
          `Level XP: **${level.enabled ? 'enabled' : 'disabled'}**`,
          `Welcome: **${welcome.enabled ? 'enabled' : 'disabled'}** • channel: ${welcome.channelId ? `<#${welcome.channelId}>` : 'not set'}`,
          `Goodbye: **${goodbye.enabled ? 'enabled' : 'disabled'}** • channel: ${goodbye.channelId ? `<#${goodbye.channelId}>` : 'not set'}`,
        ].join('\n'),
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'toggle') {
      const feature = interaction.options.getString('feature', true);
      const enabled = interaction.options.getBoolean('enabled', true);
      config.modules[feature].enabled = enabled;
      await d1.setGuildConfig(interaction.guildId, config);
      await interaction.reply({ content: `Updated **${feature}**: ${enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
      return;
    }

    if (subcommand === 'welcome') {
      const channel = interaction.options.getChannel('channel', true);
      const message = interaction.options.getString('message', true);
      config.modules.welcome.channelId = channel.id;
      config.modules.welcome.message = message;
      config.modules.welcome.enabled = true;
      await d1.setGuildConfig(interaction.guildId, config);
      await interaction.reply({ content: 'Welcome configuration updated and enabled.', ephemeral: true });
      return;
    }

    if (subcommand === 'goodbye') {
      const channel = interaction.options.getChannel('channel', true);
      const message = interaction.options.getString('message', true);
      config.modules.goodbye.channelId = channel.id;
      config.modules.goodbye.message = message;
      config.modules.goodbye.enabled = true;
      await d1.setGuildConfig(interaction.guildId, config);
      await interaction.reply({ content: 'Goodbye configuration updated and enabled.', ephemeral: true });
    }
  },
};

/**
 * hello.js - Simple hello-world slash command
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hello')
    .setDescription('Replies with a spooky greeting!'),
  async execute(interaction, state, d1) {
    // Increment local state
    state.helloUses++;
    
    // Increment global persistence (D1)
    const totalUses = parseInt(await d1.getStat('total_hello_uses') || '0') + 1;
    await d1.setStat('total_hello_uses', totalUses.toString());

    await interaction.reply({
      content: `Hello from the undead bot 👻\nTotal hello uses (session): ${state.helloUses}\nTotal hello uses (lifetime): ${totalUses}`,
    });
  },
};

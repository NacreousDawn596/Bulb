/**
 * index.js - Main Bot Entry Point
 */

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const { loadCheckpoint, saveCheckpoint } = require('./checkpoint');
const d1 = require('./d1');
const { triggerResurrection } = require('./utils/resurrection');

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Bot Runtime State
let state = {
  sessionId: Math.random().toString(36).substring(7),
  bootTime: Date.now(),
  guilds: 0,
  helloUses: 0,
  restartCount: 0,
  totalRestarts: 0,
  lastHeartbeat: Date.now(),
};

// Command Collection
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

/**
 * Startup Logic
 */
async function startup() {
  console.log('--- UNDEAD BOT STARTUP ---');
  await d1.initD1();
  
  // 1. Load state from R2
  const savedState = await loadCheckpoint();
  if (savedState) {
    console.log('Restoring state from checkpoint:', JSON.stringify(savedState, null, 2));
    state = {
      ...state,
      ...savedState,
      restartCount: (savedState.restartCount || 0) + 1,
    };
  } else {
    console.log('No checkpoint found. Initializing fresh state.');
    await d1.setStat('first_boot_timestamp', Date.now().toString());
  }

  // 2. Persistent lifetime stats from D1
  const lifetimeRestarts = parseInt(await d1.getStat('lifetime_restarts') || '0') + 1;
  await d1.setStat('lifetime_restarts', lifetimeRestarts.toString());
  state.totalRestarts = lifetimeRestarts;

  // 3. Login to Discord
  await client.login(process.env.BOT_TOKEN);
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  state.guilds = client.guilds.cache.size;
  
  // Initial save
  saveCheckpoint(state);

  // 4. Start Autosave Loop (every 60 seconds)
  setInterval(() => {
    console.log('--- AUTOSAVE ---');
    state.guilds = client.guilds.cache.size;
    
    // Log diagnostics
    console.log(`Uptime: ${Math.floor((Date.now() - state.bootTime) / 1000)}s`);
    console.log(`Memory Usage: ${Math.floor(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    
    saveCheckpoint(state);
  }, 60000);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await d1.addCommandUse(interaction.commandName);
    await command.execute(interaction, state, d1);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
  }
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  try {
    const config = await d1.getGuildConfig(message.guild.id);
    if (!config.modules.level.enabled) return;

    const xpGain = Math.floor(Math.random() * 11) + 15;
    const result = await d1.addXp(message.guild.id, message.author.id, xpGain, 60000);

    if (result.awarded && result.leveledUp) {
      await message.channel.send(
        `🎉 ${message.author} reached level **${result.level}** with **${result.totalXp} XP**!`,
      );
    }
  } catch (error) {
    console.error('messageCreate level handler failed:', error);
  }
});

client.on('guildMemberAdd', async member => {
  try {
    const config = await d1.getGuildConfig(member.guild.id);
    const welcome = config.modules.welcome;
    if (!welcome.enabled || !welcome.channelId) return;

    const channel = member.guild.channels.cache.get(welcome.channelId);
    if (!channel || !channel.isTextBased()) return;

    const text = (welcome.message || 'Welcome {user} to {server}!')
      .replaceAll('{user}', `<@${member.id}>`)
      .replaceAll('{server}', member.guild.name);

    await channel.send(text);
  } catch (error) {
    console.error('guildMemberAdd handler failed:', error);
  }
});

client.on('guildMemberRemove', async member => {
  try {
    const config = await d1.getGuildConfig(member.guild.id);
    const goodbye = config.modules.goodbye;
    if (!goodbye.enabled || !goodbye.channelId) return;

    const channel = member.guild.channels.cache.get(goodbye.channelId);
    if (!channel || !channel.isTextBased()) return;

    const text = (goodbye.message || 'Goodbye {user}.')
      .replaceAll('{user}', `<@${member.id}>`)
      .replaceAll('{server}', member.guild.name);

    await channel.send(text);
  } catch (error) {
    console.error('guildMemberRemove handler failed:', error);
  }
});

/**
 * Graceful Shutdown & Resurrection
 */
async function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down...`);
  
  // Final state update
  state.guilds = client.guilds.cache.size;
  
  // 1. Save final checkpoint
  await saveCheckpoint(state);
  
  // 2. Trigger resurrection
  await triggerResurrection();
  
  // 3. Cleanup
  client.destroy();
  console.log('Graceful shutdown complete. Resurrection requested.');
  process.exit(0);
}

// Handle termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle crashes
process.on('uncaughtException', async (error) => {
  console.error('CRASH (Uncaught Exception):', error);
  await saveCheckpoint({ ...state, lastError: error.message });
  await triggerResurrection();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('CRASH (Unhandled Rejection):', reason);
  await saveCheckpoint({ ...state, lastError: reason?.message || 'Unknown' });
  await triggerResurrection();
  process.exit(1);
});

startup().catch(err => {
  console.error('Startup Failed:', err);
  process.exit(1);
});

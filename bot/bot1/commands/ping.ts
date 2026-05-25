import type { RuntimeCommandModule } from "../../../src/bots/shared/commands";

const command: RuntimeCommandModule = {
  name: "ping",
  description: "Show bot1 runtime ping info.",
  slash: {
    description: "Show bot1 runtime ping info.",
  },
  async executeMessage({ reply, state }) {
    await reply(`pong from bot1 | guilds=${state.guilds} | restarts=${state.totalRestarts}`);
  },
  async executeSlash({ reply, state }) {
    await reply({
      content: `pong from bot1 | guilds=${state.guilds} | restarts=${state.totalRestarts}`,
      ephemeral: true,
    });
  },
};

export default command;

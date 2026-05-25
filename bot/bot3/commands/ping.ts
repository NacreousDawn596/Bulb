import type { RuntimeCommandModule } from "../../../src/bots/shared/commands";

const command: RuntimeCommandModule = {
  name: "ping",
  description: "Show bot3 ping info.",
  slash: {
    description: "Show bot3 ping info.",
  },
  async executeMessage({ reply, state }) {
    await reply(`pong | latency=${state.latencyMs}ms | guilds=${state.guilds}`);
  },
  async executeSlash({ reply, state }) {
    await reply({
      content: `pong | latency=${state.latencyMs}ms | guilds=${state.guilds}`,
      ephemeral: true,
    });
  },
};

export default command;

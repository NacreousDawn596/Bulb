import type { RuntimeCommandModule } from "../../../src/bots/shared/commands";

const command: RuntimeCommandModule = {
  name: "hello",
  description: "Say hello from bot3.",
  slash: {
    description: "Say hello from bot3.",
  },
  async executeMessage({ config, reply }) {
    await reply(config.helloMessage?.trim() || `Hello from ${config.displayName ?? config.id} 👻`);
  },
  async executeSlash({ config, reply }) {
    await reply({
      content: config.helloMessage?.trim() || `Hello from ${config.displayName ?? config.id} 👻`,
      ephemeral: true,
    });
  },
};

export default command;

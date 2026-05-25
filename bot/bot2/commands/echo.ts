import type { RuntimeCommandModule } from "../../../src/bots/shared/commands";

const command: RuntimeCommandModule = {
  name: "echo",
  description: "Echo text back from bot2.",
  slash: {
    description: "Echo text back from bot2.",
    options: [
      {
        type: 3,
        name: "text",
        description: "Text to echo",
        required: true,
      },
    ],
  },
  async executeMessage({ config, rawArgs, reply }) {
    if (!rawArgs) {
      await reply(`usage: ${config.prefix}echo <text>`);
      return;
    }

    await reply(rawArgs);
  },
  async executeSlash({ getString, reply }) {
    const text = getString("text", true);
    await reply(text ?? "");
  },
};

export default command;

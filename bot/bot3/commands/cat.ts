import type { RuntimeCommandModule } from "../../../src/bots/shared/commands";

const command: RuntimeCommandModule = {
  name: "cat",
  description: "Get a random cat image.",
  slash: {
    description: "Get a random cat image.",
  },
  async executeMessage({ reply }) {
    const response = await fetch("https://cataas.com/cat?json=true");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as { url?: string };
    await reply(`https://cataas.com${data.url ?? ""}`);
  },
  async executeSlash(context) {
    await command.executeMessage({
      args: [],
      botId: context.botId,
      commands: context.commands,
      config: context.config,
      d1: context.d1,
      logger: context.logger,
      message: null as never,
      rawArgs: "",
      reply: context.reply,
      state: context.state,
    });
  },
};

export default command;

import type { RuntimeCommandModule } from "../../../src/bots/shared/commands";

const command: RuntimeCommandModule = {
  name: "dog",
  description: "Get a random dog image.",
  slash: {
    description: "Get a random dog image.",
  },
  async executeMessage({ reply }) {
    const response = await fetch("https://dog.ceo/api/breeds/image/random");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as { message?: string };
    await reply(data.message ?? "No dog image returned.");
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

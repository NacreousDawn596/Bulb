import type { RuntimeCommandModule } from "../../../src/bots/shared/commands";

const command: RuntimeCommandModule = {
  name: "help",
  description: "List available prefix and slash commands.",
  slash: {
    description: "List available prefix and slash commands.",
  },
  async executeMessage({ commands, config, reply }) {
    const names = commands.map((item) => item.name).sort();
    await reply(
      [
        `prefix: ${config.prefix}`,
        "message commands:",
        ...names.map((name) => `${config.prefix}${name}`),
        "slash commands:",
        ...names.map((name) => `/${name}`),
      ].join("\n"),
    );
  },
  async executeSlash(context) {
    await command.executeMessage!({
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

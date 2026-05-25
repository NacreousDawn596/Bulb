import type { RuntimeCommandModule } from "../../../src/bots/shared/commands";

const command: RuntimeCommandModule = {
  name: "botinfo",
  description: "Show bot runtime info and top commands.",
  slash: {
    description: "Show bot runtime info and top commands.",
  },
  async executeMessage({ botId, config, d1, reply, state }) {
    const uptimeSec = Math.floor((Date.now() - state.startedAt) / 1000);
    const topCommands = await d1.getTopCommands(botId, 5);
    const lines = topCommands.length
      ? topCommands.map((row, index) => `${index + 1}. ${row.command}: ${row.uses}`).join("\n")
      : "No command usage yet.";

    await reply(
      [
        `bot: ${config.displayName ?? config.id}`,
        `session: ${state.sessionId}`,
        `uptime: ${uptimeSec}s`,
        `guilds: ${state.guilds}`,
        `restarts: ${state.totalRestarts}`,
        "top commands:",
        lines,
      ].join("\n"),
    );
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

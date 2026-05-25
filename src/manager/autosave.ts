import { RuntimeBot } from "../bots/shared/runtimeBot";
import { Logger } from "../services/logger";

export class AutosaveController {
  constructor(
    private readonly intervalMs: number,
    private readonly logger: Logger,
  ) {}

  attach(bot: RuntimeBot): void {
    bot.startAutosave(this.intervalMs);
    this.logger.info("Autosave scheduled", {
      botId: bot.config.id,
      intervalMs: this.intervalMs,
    });
  }

  detach(bot: RuntimeBot): void {
    bot.stopAutosave();
    this.logger.info("Autosave stopped", { botId: bot.config.id });
  }
}

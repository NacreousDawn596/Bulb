import { RuntimeBot } from "../bots/shared/runtimeBot";
import { createRuntimeSnapshot } from "../state/runtime";
import { Logger } from "../services/logger";

export class HealthMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly startedAt: number,
    private readonly logger: Logger,
  ) {}

  start(getBots: () => RuntimeBot[], intervalMs = 30_000): void {
    this.stop();
    this.timer = setInterval(() => {
      const bots = getBots();
      const runtime = createRuntimeSnapshot(
        this.startedAt,
        bots.length,
        bots.filter((bot) => Boolean(bot.getHealth().ready)).length,
      );

      this.logger.info("Runtime health", runtime);
      for (const bot of bots) {
        this.logger.info("Bot health", bot.getHealth());
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

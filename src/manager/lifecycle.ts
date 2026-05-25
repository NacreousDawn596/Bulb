import { botLayoutHint, BotConfig, discoverBots } from "../config/bots";
import { RuntimeBot } from "../bots/shared/runtimeBot";
import { CheckpointService } from "../services/checkpoint";
import { D1Service } from "../services/d1";
import { createBotLogger, Logger } from "../services/logger";
import { sleep } from "../utils/sleep";
import { AutosaveController } from "./autosave";
import { HealthMonitor } from "./health";

type ManagerDependencies = {
  d1: D1Service;
  checkpointService: CheckpointService;
  managerLogger: Logger;
};

export class BotManager {
  private readonly bots: RuntimeBot[] = [];
  private readonly startupDelayMs: number;
  private readonly autosave: AutosaveController;
  private readonly health: HealthMonitor;

  constructor(private readonly dependencies: ManagerDependencies) {
    this.startupDelayMs = Number(process.env.BOT_STARTUP_DELAY_MS ?? "5000");
    this.autosave = new AutosaveController(Number(process.env.BOT_AUTOSAVE_MS ?? "60000"), dependencies.managerLogger);
    this.health = new HealthMonitor(Date.now(), dependencies.managerLogger);
  }

  async bootstrap(): Promise<RuntimeBot[]> {
    const configs = await this.getEnabledConfigs();
    if (configs.length === 0) {
      throw new Error(`No runnable bots discovered. Expected layout: ${botLayoutHint()}`);
    }

    const prepared = await Promise.allSettled(configs.map((config) => this.prepareBot(config)));
    for (const result of prepared) {
      if (result.status === "fulfilled") {
        this.bots.push(result.value);
      } else {
        this.dependencies.managerLogger.error("Bot preparation failed", {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    for (const bot of this.bots) {
      try {
        this.dependencies.managerLogger.info("Connecting bot", {
          botId: bot.config.id,
          delayMs: bot.config.startupDelayMs ?? this.startupDelayMs,
        });
        await bot.connect();
        this.autosave.attach(bot);
      } catch (error) {
        this.dependencies.managerLogger.error("Bot connection failed", {
          botId: bot.config.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await sleep(bot.config.startupDelayMs ?? this.startupDelayMs);
    }

    if (this.bots.length === 0) {
      throw new Error("Bot preparation completed with zero runnable bots.");
    }

    this.health.start(() => this.bots);
    return this.bots;
  }

  listBots(): RuntimeBot[] {
    return [...this.bots];
  }

  async shutdown(reason: string): Promise<void> {
    this.health.stop();
    for (const bot of this.bots) {
      this.autosave.detach(bot);
    }

    await Promise.allSettled(this.bots.map((bot) => bot.shutdown(reason)));
  }

  private async getEnabledConfigs(): Promise<BotConfig[]> {
    const discovered = await discoverBots(this.dependencies.managerLogger);
    if (discovered.length === 0) {
      this.dependencies.managerLogger.warn("No bot manifests found", {
        expectedLayout: botLayoutHint(),
      });
      return [];
    }

    return discovered.filter((config) => {
      if (!config.enabled) {
        this.dependencies.managerLogger.warn("Bot disabled in config", { botId: config.id });
        return false;
      }

      if (!config.token) {
        this.dependencies.managerLogger.warn("Bot skipped because token is missing", {
          botId: config.id,
          tokenEnv: config.tokenEnv,
          directory: config.directory,
        });
        return false;
      }

      return true;
    });
  }

  private async prepareBot(config: BotConfig): Promise<RuntimeBot> {
    const logger = createBotLogger(config.id);
    const bot = new RuntimeBot(config, {
      d1: this.dependencies.d1,
      checkpointService: this.dependencies.checkpointService,
      logger,
    });

    await bot.restore();
    return bot;
  }
}

import { BotManager } from "./lifecycle";
import { CheckpointService } from "../services/checkpoint";
import { D1Service } from "../services/d1";
import { Logger } from "../services/logger";
import { R2Service } from "../services/r2";
import { MANAGER_BOT_ID } from "../state/runtime";

export async function bootstrapManager(): Promise<BotManager> {
  const managerLogger = new Logger("MANAGER");
  const d1Logger = new Logger("D1");
  const r2Logger = new Logger("R2");
  const checkpointLogger = new Logger("CHECKPOINT");

  const d1 = new D1Service(d1Logger);
  const r2 = new R2Service(r2Logger);
  const checkpointService = new CheckpointService(r2, checkpointLogger);

  await d1.initSchema();
  await d1.recordRuntimeEvent(MANAGER_BOT_ID, "bootstrap", "info", {
    startedAt: Date.now(),
  });

  const manager = new BotManager({
    d1,
    checkpointService,
    managerLogger,
  });

  await manager.bootstrap();
  await d1.resetReviverBackoff(MANAGER_BOT_ID);
  await d1.recordRuntimeEvent(MANAGER_BOT_ID, "bootstrap_complete", "info", {
    bots: manager.listBots().map((bot) => bot.config.id),
  });
  managerLogger.info("Bootstrap complete", {
    bots: manager.listBots().map((bot) => bot.config.id),
  });

  return manager;
}

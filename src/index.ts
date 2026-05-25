import "dotenv/config";

import { bootstrapManager } from "./manager/bootstrap";
import { registerShutdownHandlers } from "./manager/shutdown";
import { D1Service } from "./services/d1";
import { Logger } from "./services/logger";
import { notifyReviver } from "./services/reviver";
import { MANAGER_BOT_ID } from "./state/runtime";

async function main(): Promise<void> {
  const manager = await bootstrapManager();
  const d1 = new D1Service(new Logger("D1"));
  registerShutdownHandlers({
    manager,
    d1,
    logger: new Logger("MANAGER"),
  });
}

main().catch((error) => {
  const logger = new Logger("MANAGER");
  const d1 = new D1Service(new Logger("D1"));

  logger.error("Fatal startup failure", {
    error: error instanceof Error ? error.message : String(error),
  });

  void d1.recordRuntimeEvent(MANAGER_BOT_ID, "fatal_startup", "error", {
    error: error instanceof Error ? error.message : String(error),
  }).catch(() => undefined);

  void notifyReviver(logger, "startup_failure").catch(() => undefined).finally(() => {
    process.exit(1);
  });
});

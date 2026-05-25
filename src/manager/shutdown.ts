import { BotManager } from "./lifecycle";
import { D1Service } from "../services/d1";
import { Logger } from "../services/logger";
import { notifyReviver } from "../services/reviver";
import { MANAGER_BOT_ID } from "../state/runtime";

type ShutdownDependencies = {
  manager: BotManager;
  d1: D1Service;
  logger: Logger;
};

export function registerShutdownHandlers(dependencies: ShutdownDependencies): void {
  let shuttingDown = false;

  const handleShutdown = async (reason: string, exitCode: number) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    dependencies.logger.warn("Shutdown initiated", { reason });

    try {
      await dependencies.manager.shutdown(reason);
      await dependencies.d1.recordRuntimeEvent(MANAGER_BOT_ID, "shutdown", "info", { reason });
      await notifyReviver(dependencies.logger, reason);
    } catch (error) {
      dependencies.logger.error("Shutdown sequence failed", {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      process.exit(exitCode);
    }
  };

  process.on("SIGTERM", () => {
    void handleShutdown("SIGTERM", 0);
  });

  process.on("SIGINT", () => {
    void handleShutdown("SIGINT", 0);
  });

  process.on("uncaughtException", (error) => {
    void dependencies.d1.recordRuntimeEvent(MANAGER_BOT_ID, "uncaught_exception", "error", {
      error: error.message,
      stack: error.stack,
    });
    void handleShutdown(`uncaughtException:${error.message}`, 1);
  });

  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    void dependencies.d1.recordRuntimeEvent(MANAGER_BOT_ID, "unhandled_rejection", "error", {
      error: message,
    });
    void handleShutdown(`unhandledRejection:${message}`, 1);
  });
}

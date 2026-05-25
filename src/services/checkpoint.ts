import { BotRuntimeState } from "../state/botState";
import { compressJson, decompressJson } from "../utils/compression";
import { Logger } from "./logger";
import { R2Service } from "./r2";

export class CheckpointService {
  // Serialize saves per bot to avoid concurrent writes to the same R2 key.
  private readonly saveQueue = new Map<string, Promise<void>>();

  constructor(
    private readonly r2: R2Service,
    private readonly logger: Logger,
  ) {}

  private key(botId: string): string {
    return `checkpoints/${botId}/latest.br`;
  }

  async save(botId: string, state: BotRuntimeState): Promise<void> {
    const previous = this.saveQueue.get(botId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.writeCheckpoint(botId, state));

    this.saveQueue.set(botId, next);

    try {
      await next;
    } finally {
      if (this.saveQueue.get(botId) === next) {
        this.saveQueue.delete(botId);
      }
    }
  }

  async load(botId: string): Promise<BotRuntimeState | null> {
    const payload = await this.r2.getObject(this.key(botId));
    if (!payload) {
      this.logger.info("Checkpoint not found", { botId });
      return null;
    }

    const restored = decompressJson<BotRuntimeState>(payload);
    this.logger.info("Checkpoint restored", {
      botId,
      key: this.key(botId),
      restartCount: restored.restartCount,
    });
    return restored;
  }

  private async writeCheckpoint(botId: string, state: BotRuntimeState): Promise<void> {
    const payload = compressJson({
      ...state,
      heartbeatAt: Date.now(),
      lastAutosaveAt: Date.now(),
    });
    await this.r2.putObject(this.key(botId), payload, "application/json", "br");
    this.logger.info("Checkpoint saved", {
      botId,
      key: this.key(botId),
      guilds: state.guilds,
      restartCount: state.restartCount,
    });
  }
}

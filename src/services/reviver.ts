import { Logger } from "./logger";

export async function notifyReviver(logger: Logger, reason: string): Promise<void> {
  const reviverUrl = process.env.REVIVER_URL;
  const reviverSecret = process.env.REVIVER_SECRET;

  if (!reviverUrl || !reviverSecret) {
    logger.warn("Reviver not configured; skipping resurrection trigger");
    return;
  }

  const response = await fetch(`${reviverUrl}/revive`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${reviverSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source: "__manager__", reason }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Reviver returned ${response.status}: ${body}`);
  }

  logger.info("Reviver notified", { reason });
}

type LogScope =
  | "MANAGER"
  | "CHECKPOINT"
  | "REVIVER"
  | "D1"
  | "R2"
  | `BOT:${string}`;

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function timestamp(): string {
  return new Date().toISOString();
}

function serialize(payload?: unknown): string {
  if (payload === undefined) {
    return "";
  }

  if (typeof payload === "string") {
    return ` ${payload}`;
  }

  return ` ${JSON.stringify(payload)}`;
}

export class Logger {
  constructor(private readonly scope: LogScope) {}

  private write(level: LogLevel, message: string, payload?: unknown): void {
    const line = `[${timestamp()}] [${level}] [${this.scope}] ${message}${serialize(payload)}`;
    if (level === "ERROR") {
      console.error(line);
      return;
    }
    if (level === "WARN") {
      console.warn(line);
      return;
    }
    console.log(line);
  }

  info(message: string, payload?: unknown): void {
    this.write("INFO", message, payload);
  }

  warn(message: string, payload?: unknown): void {
    this.write("WARN", message, payload);
  }

  error(message: string, payload?: unknown): void {
    this.write("ERROR", message, payload);
  }

  debug(message: string, payload?: unknown): void {
    this.write("DEBUG", message, payload);
  }
}

export function createBotLogger(botId: string): Logger {
  return new Logger(`BOT:${botId}`);
}

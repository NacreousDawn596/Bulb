type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  factor?: number;
  maxDelayMs?: number;
  label?: string;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 1_000,
    factor = 2,
    maxDelayMs = 10_000,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= attempts) {
        break;
      }

      const delayMs = Math.min(baseDelayMs * factor ** (attempt - 1), maxDelayMs);
      onRetry?.(error, attempt, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

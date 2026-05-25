export function createHelloMessage(botId: string, customMessage?: string): string {
  return customMessage?.trim() || `Hello from bot ${botId} 👻`;
}

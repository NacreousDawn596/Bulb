import type { RuntimeCommandModule } from "../../../src/bots/shared/commands";

async function resolveIp(query: string): Promise<string> {
  const response = await fetch(`https://ipinfo.io/${encodeURIComponent(query)}/json`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = (await response.json()) as Record<string, string | boolean | undefined>;
  if (data.bogon) {
    return "This is a bogon/private address with no public geolocation.";
  }

  return [
    `IP: ${String(data.ip ?? query)}`,
    `City: ${String(data.city ?? "Unknown")}`,
    `Region: ${String(data.region ?? "Unknown")}`,
    `Country: ${String(data.country ?? "Unknown")}`,
    `Org: ${String(data.org ?? "Unknown")}`,
    `Timezone: ${String(data.timezone ?? "Unknown")}`,
  ].join("\n");
}

const command: RuntimeCommandModule = {
  name: "ip",
  description: "Lookup rough geo/network info for an IP or hostname.",
  slash: {
    description: "Lookup rough geo/network info for an IP or hostname.",
    options: [
      {
        type: 3,
        name: "query",
        description: "IPv4, IPv6, or hostname",
        required: true,
      },
    ],
  },
  async executeMessage({ config, rawArgs, reply }) {
    if (!rawArgs) {
      await reply(`usage: ${config.prefix}ip <ipv4|ipv6|hostname>`);
      return;
    }

    await reply(await resolveIp(rawArgs.trim()));
  },
  async executeSlash({ getString, reply }) {
    const query = getString("query", true);
    await reply({
      content: await resolveIp(query ?? ""),
      ephemeral: true,
    });
  },
};

export default command;

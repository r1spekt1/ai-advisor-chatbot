import { FxArgs, ToolResult } from "../schema/tools";
import { withCache, TTL } from "./cache";

const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest";

export async function fetchRate(rawArgs: unknown): Promise<ToolResult> {
  const parsed = FxArgs.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      ok: false,
      source: "frankfurter",
      fetchedAt: new Date().toISOString(),
      data: null,
      error: parsed.error.message,
    };
  }
  const args = parsed.data;

  try {
    return await withCache("get_exchange_rate", args, TTL.fx, async () => {
      const url = new URL(FRANKFURTER_URL);
      url.searchParams.set("base", args.from);
      url.searchParams.set("symbols", args.to);

      const res = await fetch(url);
      if (!res.ok) {
        return {
          ok: false,
          source: "frankfurter",
          fetchedAt: new Date().toISOString(),
          data: null,
          error: `Exchange rate request failed with status ${res.status}`,
        };
      }
      const json = await res.json();
      const rate = json?.rates?.[args.to];
      if (typeof rate !== "number") {
        return {
          ok: false,
          source: "frankfurter",
          fetchedAt: new Date().toISOString(),
          data: null,
          error: `No rate found for ${args.from} -> ${args.to}`,
        };
      }

      return {
        ok: true,
        source: "frankfurter",
        fetchedAt: new Date().toISOString(),
        data: {
          from: args.from,
          to: args.to,
          rate,
          amount: args.amount ?? null,
          converted: args.amount != null ? args.amount * rate : null,
        },
        error: null,
      };
    });
  } catch (err) {
    return {
      ok: false,
      source: "frankfurter",
      fetchedAt: new Date().toISOString(),
      data: null,
      error: err instanceof Error ? err.message : "Unknown error fetching exchange rate",
    };
  }
}

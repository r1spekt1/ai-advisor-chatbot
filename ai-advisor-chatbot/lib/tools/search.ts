import { generateText } from "ai";
import { SearchArgs, ToolResult } from "../schema/tools";
import { getProvider } from "../ai/provider";
import { SEARCH_MODEL } from "../models";
import { withCache, TTL } from "./cache";

export async function fetchSearch(rawArgs: unknown): Promise<ToolResult> {
  const parsed = SearchArgs.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      ok: false,
      source: "openrouter-online",
      fetchedAt: new Date().toISOString(),
      data: null,
      error: parsed.error.message,
    };
  }
  const args = parsed.data;

  try {
    return await withCache("web_search", args, TTL.search, async () => {
      const result = await generateText({
        model: getProvider()(SEARCH_MODEL),
        instructions:
          "You are a factual research assistant. Answer the query with a concise, " +
          "factual summary and list the source URLs you used. Be brief.",
        prompt:
          `Query: ${args.query}\n` +
          `Recency: ${args.recency}\n` +
          `Limit to at most 3 sources.`,
        providerOptions: {
          openrouter: {
            plugins: [{ id: "web", max_results: 3 }],
          },
        },
      });

      return {
        ok: true,
        source: "openrouter-online",
        fetchedAt: new Date().toISOString(),
        data: {
          query: args.query,
          summary: result.text,
        },
        error: null,
      };
    });
  } catch (err) {
    return {
      ok: false,
      source: "openrouter-online",
      fetchedAt: new Date().toISOString(),
      data: null,
      error: err instanceof Error ? err.message : "Unknown error fetching search results",
    };
  }
}

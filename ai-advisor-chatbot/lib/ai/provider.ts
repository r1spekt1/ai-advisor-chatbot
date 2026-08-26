// lib/ai/provider.ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Lazy on purpose: `next build` imports route modules to collect page data,
// and the key only exists at runtime (compose supplies it via env_file).
let instance: ReturnType<typeof createOpenRouter> | null = null;

export function getProvider() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  instance ??= createOpenRouter({ apiKey });
  return instance;
}

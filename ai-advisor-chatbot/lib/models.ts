import { envString } from "./env";

// Haiku by default: the shared key has a $5 cap and reviewers run the app
// on that same key. Both models were tested on the clean build with no
// material difference in advice quality, and every prompt in this project
// was tuned against Haiku. CHAT_MODEL switches to Sonnet 5 if wanted.
export const CHAT_MODEL = envString(
  process.env.CHAT_MODEL,
  "anthropic/claude-haiku-4.5",
);

export const UTILITY_MODEL = "anthropic/claude-haiku-4.5";
export const SEARCH_MODEL = "anthropic/claude-haiku-4.5:online";
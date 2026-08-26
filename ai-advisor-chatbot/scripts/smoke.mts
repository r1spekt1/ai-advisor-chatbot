import { generateText } from "ai";
import { getProvider } from "../lib/ai/provider";
import { UTILITY_MODEL } from "../lib/models";

const result = await generateText({
  model: getProvider()(UTILITY_MODEL),
  instructions: "You are terse.",
  prompt: "Say hello in exactly five words.",
});

console.log(result.text);
console.log(result.usage);

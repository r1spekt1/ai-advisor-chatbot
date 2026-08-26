import { asc, eq } from "drizzle-orm";
import { generateText, type UIMessage } from "ai";
import { db } from "@/lib/db";
import { conversation, message, type Message } from "@/lib/db/schema";
import { getProvider } from "@/lib/ai/provider";
import { UTILITY_MODEL } from "@/lib/models";
import { envNumber } from "./env";

// Token threshold that triggers summarizing the oldest unsummarized chunk.
export const CONTEXT_TOKEN_THRESHOLD = envNumber(
  process.env.CONTEXT_TOKEN_THRESHOLD,
  8000,
);

// Most-recent messages are never folded into the summary, regardless of threshold.
const RECENT_WINDOW_MESSAGES = 10;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function messageText(m: Message): string {
  return (m.parts as { type: string; text?: string }[])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join(" ");
}

function toUIMessage(m: Message): UIMessage {
  return { id: m.id, role: m.role, parts: m.parts } as UIMessage;
}

async function loadOrderedMessages(conversationId: string): Promise<Message[]> {
  return db
    .select()
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(asc(message.createdAt));
}

export async function buildContext(
  conversationId: string,
): Promise<{ summary: string | null; messages: UIMessage[] }> {
  const [convo] = await db.select().from(conversation).where(eq(conversation.id, conversationId));
  const allMessages = await loadOrderedMessages(conversationId);

  if (!convo?.summary || !convo.summarizedUptoMessageId) {
    return { summary: null, messages: allMessages.map(toUIMessage) };
  }

  const cutoffIndex = allMessages.findIndex((m) => m.id === convo.summarizedUptoMessageId);
  const remaining = cutoffIndex === -1 ? allMessages : allMessages.slice(cutoffIndex + 1);

  return { summary: convo.summary, messages: remaining.map(toUIMessage) };
}

const SUMMARY_INSTRUCTIONS = `Summarize the oldest part of this travel-advisor conversation, to be reused as \
context in later turns.

Capture ONLY:
- the conversational flow — how the discussion moved from topic to topic
- the traveler's tone, and what they reacted well or badly to (enthusiasm, hesitation, \
frustration, jokes, corrections)
- open threads or questions raised but not yet resolved

Do NOT restate destinations, dates, budget, or preferences. Those already live in the trip \
plan and traveler profile, which are injected separately — repeating them here would only \
duplicate context and waste space.

Keep it under 200 words, plain prose, no headings.`;

export async function maybeSummarize(conversationId: string): Promise<void> {
  try {
    const [convo] = await db.select().from(conversation).where(eq(conversation.id, conversationId));
    if (!convo) return;

    const allMessages = await loadOrderedMessages(conversationId);
    const cutoffIndex = convo.summarizedUptoMessageId
      ? allMessages.findIndex((m) => m.id === convo.summarizedUptoMessageId)
      : -1;
    const unsummarized = allMessages.slice(cutoffIndex + 1);

    const summarizable = unsummarized.slice(0, Math.max(0, unsummarized.length - RECENT_WINDOW_MESSAGES));
    if (summarizable.length === 0) return;

    const tokenCount = unsummarized.reduce((sum, m) => sum + estimateTokens(messageText(m)), 0);
    if (tokenCount <= CONTEXT_TOKEN_THRESHOLD) return;

    const transcript = summarizable
      .map((m) => `${m.role === "user" ? "Traveler" : "Advisor"}: ${messageText(m)}`)
      .join("\n");
    const prompt = convo.summary
      ? `Previous summary:\n${convo.summary}\n\nNew messages to fold in:\n${transcript}`
      : transcript;

    const { text } = await generateText({
      model: getProvider()(UTILITY_MODEL),
      instructions: SUMMARY_INSTRUCTIONS,
      prompt,
    });

    await db
      .update(conversation)
      .set({
        summary: text.trim(),
        summarizedUptoMessageId: summarizable[summarizable.length - 1].id,
        updatedAt: new Date(),
      })
      .where(eq(conversation.id, conversationId));
  } catch (error) {
    console.error("[context] maybeSummarize failed:", error);
  }
}

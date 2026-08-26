import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateText,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { db } from "@/lib/db";
import { conversation, message, type Conversation } from "@/lib/db/schema";
import { getOrCreateTraveler } from "@/lib/traveler";
import { getSettings } from "@/lib/settings";
import { getProfile } from "@/lib/profile";
import { getTrip } from "@/lib/trip";
import { TripPlan, emptyPlan } from "@/lib/schema";
import { composeSystemPrompt } from "@/lib/prompt";
import { getProvider } from "@/lib/ai/provider";
import { CHAT_MODEL, UTILITY_MODEL } from "@/lib/models";
import { buildTools } from "@/lib/tools";
import { buildContext, maybeSummarize } from "@/lib/context";

async function getOrCreateConversation(
  travelerId: string,
  conversationId: string | undefined,
): Promise<Conversation> {
  if (conversationId) {
    const [existing] = await db
      .select()
      .from(conversation)
      .where(and(eq(conversation.id, conversationId), eq(conversation.travelerId, travelerId)));
    if (existing) return existing;
  }

  const now = new Date();
  const [created] = await db
    .insert(conversation)
    .values({
      id: randomUUID(),
      travelerId,
      tripId: null,
      title: "New conversation",
      summary: "",
      summarizedUptoMessageId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
}

async function generateTitle(conversationId: string, openingMessage: string): Promise<void> {
  const fallback = openingMessage.slice(0, 40);
  try {
    const { text } = await generateText({
      model: getProvider()(UTILITY_MODEL),
      instructions:
        "Produce a short, plain title (max 6 words, no quotes or punctuation at the end) " +
        "summarizing what the traveler is asking about. Reply with only the title.",
      prompt: openingMessage,
    });
    const title = text.trim().slice(0, 60) || fallback;
    await db
      .update(conversation)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversation.id, conversationId));
  } catch (error) {
    console.error("[chat] title generation failed:", error);
    await db
      .update(conversation)
      .set({ title: fallback, updatedAt: new Date() })
      .where(eq(conversation.id, conversationId));
  }
}

export async function POST(req: Request) {
  const {
    messages,
    conversationId,
  }: { messages: UIMessage[]; conversationId?: string } = await req.json();

  const traveler = await getOrCreateTraveler();
  const settings = await getSettings();
  const profile = await getProfile(traveler.id);
  const conversationRow = await getOrCreateConversation(traveler.id, conversationId);

  const tripRow = await getTrip(traveler.id);
  let plan: TripPlan | undefined;
  if (tripRow) {
    const parsed = TripPlan.safeParse(tripRow.plan);
    plan = parsed.success ? parsed.data : emptyPlan();
  }

  const [{ value: existingMessageCount }] = await db
    .select({ value: count() })
    .from(message)
    .where(eq(message.conversationId, conversationRow.id));
  const isFirstExchange = existingMessageCount === 0;

  const userMessage = messages[messages.length - 1];
  await db.insert(message).values({
    id: userMessage.id,
    conversationId: conversationRow.id,
    role: "user",
    parts: userMessage.parts,
    createdAt: new Date(),
  });

  const context = await buildContext(conversationRow.id);

  const result = streamText({
    model: getProvider()(CHAT_MODEL),
    instructions: composeSystemPrompt({
      persona: settings.personaPrompt,
      profile,
      plan,
      summary: context.summary,
    }),
    messages: await convertToModelMessages(context.messages),
    tools: buildTools(traveler.id, conversationRow.id),
    stopWhen: isStepCount(5),
  });

  const uiStream = toUIMessageStream({
    stream: result.stream,
    originalMessages: messages,
    generateMessageId: () => randomUUID(),
    onFinish: async ({ responseMessage }) => {
      await db.insert(message).values({
        id: responseMessage.id,
        conversationId: conversationRow.id,
        role: "assistant",
        parts: responseMessage.parts,
        createdAt: new Date(),
      });

      if (isFirstExchange) {
        const openingText = userMessage.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(" ");
        void generateTitle(conversationRow.id, openingText);
      }

      void maybeSummarize(conversationRow.id);
    },
    onError: (error) => {
      console.error("[chat] stream error:", error);
      return "Something went wrong while generating a response.";
    },
  });

  return createUIMessageStreamResponse({ stream: uiStream, headers: { "X-Conversation-Id": conversationRow.id } });
}

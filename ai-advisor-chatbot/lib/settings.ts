import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings, type Settings } from "@/lib/db/schema";

export const DEFAULT_PERSONA_PROMPT = `Warm, practical, and enthusiastic about travel. Ask a clarifying \
question when the traveler's request is vague, prefer concrete recommendations over generic \
ones, and keep responses conversational rather than list-heavy unless asked for a breakdown.`;

// No caching: settings are read fresh on every request so persona edits apply immediately.
export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return row;

  const [created] = await db
    .insert(settings)
    .values({ id: 1, personaPrompt: DEFAULT_PERSONA_PROMPT, updatedAt: new Date() })
    .returning();

  return created;
}

export async function updatePersonaPrompt(personaPrompt: string): Promise<Settings> {
  await getSettings(); // ensure the row exists

  const [updated] = await db
    .update(settings)
    .set({ personaPrompt, updatedAt: new Date() })
    .where(eq(settings.id, 1))
    .returning();

  return updated;
}

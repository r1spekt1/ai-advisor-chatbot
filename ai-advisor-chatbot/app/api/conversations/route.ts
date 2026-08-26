import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversation } from "@/lib/db/schema";
import { getOrCreateTraveler } from "@/lib/traveler";

export async function GET() {
  const traveler = await getOrCreateTraveler();

  const rows = await db
    .select({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
    })
    .from(conversation)
    .where(eq(conversation.travelerId, traveler.id))
    .orderBy(desc(conversation.updatedAt));

  return Response.json(rows);
}

export async function POST() {
  const traveler = await getOrCreateTraveler();

  const now = new Date();
  const [created] = await db
    .insert(conversation)
    .values({
      id: randomUUID(),
      travelerId: traveler.id,
      tripId: null,
      title: "New conversation",
      summary: "",
      summarizedUptoMessageId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return Response.json(created);
}

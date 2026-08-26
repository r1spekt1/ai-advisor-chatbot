import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversation, message } from "@/lib/db/schema";
import { getOrCreateTraveler } from "@/lib/traveler";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const traveler = await getOrCreateTraveler();

  const [owned] = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.travelerId, traveler.id)));

  if (!owned) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(message)
    .where(eq(message.conversationId, id))
    .orderBy(asc(message.createdAt));

  return Response.json(rows);
}

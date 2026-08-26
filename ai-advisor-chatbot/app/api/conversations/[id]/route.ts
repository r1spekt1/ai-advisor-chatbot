import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversation } from "@/lib/db/schema";
import { getOrCreateTraveler } from "@/lib/traveler";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const traveler = await getOrCreateTraveler();

  const [deleted] = await db
    .delete(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.travelerId, traveler.id)))
    .returning();

  if (!deleted) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}

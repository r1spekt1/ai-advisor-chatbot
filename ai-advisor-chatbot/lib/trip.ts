import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { trip, type Trip } from "@/lib/db/schema";
import { TripPlan, emptyPlan, applyOps, type PlanOp } from "@/lib/schema";

export async function getOrCreateTrip(travelerId: string): Promise<Trip> {
  const [existing] = await db.select().from(trip).where(eq(trip.travelerId, travelerId));
  if (existing) return existing;

  const now = new Date();
  const [created] = await db
    .insert(trip)
    .values({
      id: randomUUID(),
      travelerId,
      plan: emptyPlan(),
      version: 1,
      updatedAt: now,
    })
    .returning();

  return created;
}

export async function getTrip(travelerId: string): Promise<Trip | null> {
  const [row] = await db.select().from(trip).where(eq(trip.travelerId, travelerId));
  return row ?? null;
}

export type ApplyPlanOpsResult = {
  plan: TripPlan;
  version: number;
  rejected: string[];
  conflict: boolean;
};

export async function applyPlanOps(
  travelerId: string,
  ops: PlanOp[],
  expectedVersion?: number,
  source: "user" | "model" = "model",
): Promise<ApplyPlanOpsResult> {
  const tripRow = await getOrCreateTrip(travelerId);
  const parsed = TripPlan.safeParse(tripRow.plan);
  const currentPlan = parsed.success ? parsed.data : emptyPlan();

  if (expectedVersion !== undefined && expectedVersion !== tripRow.version) {
    return { plan: currentPlan, version: tripRow.version, rejected: [], conflict: true };
  }

  const { plan: nextPlan, rejected } = applyOps(currentPlan, ops, source);
  const nextVersion = tripRow.version + 1;

  await db
    .update(trip)
    .set({ plan: nextPlan, version: nextVersion, updatedAt: new Date() })
    .where(eq(trip.id, tripRow.id));

  return { plan: nextPlan, version: nextVersion, rejected, conflict: false };
}

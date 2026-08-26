import { z } from "zod";
import { getOrCreateTraveler } from "@/lib/traveler";
import { getTrip, applyPlanOps } from "@/lib/trip";
import { TripPlan, PlanOp, emptyPlan } from "@/lib/schema";

const PatchPlanBody = z.object({
  ops: z.array(PlanOp).min(1).max(20),
  version: z.number().int(),
}).strict();

export async function GET() {
  const traveler = await getOrCreateTraveler();
  const tripRow = await getTrip(traveler.id);

  if (!tripRow) {
    return Response.json(null);
  }

  const parsed = TripPlan.safeParse(tripRow.plan);
  const plan = parsed.success ? parsed.data : emptyPlan();

  return Response.json({ plan, version: tripRow.version });
}

export async function PATCH(req: Request) {
  const traveler = await getOrCreateTraveler();
  const body = await req.json();
  const parsed = PatchPlanBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await applyPlanOps(
    traveler.id,
    parsed.data.ops,
    parsed.data.version,
    "user",
  );

  if (result.conflict) {
    return Response.json(
      { plan: result.plan, version: result.version, rejected: [] },
      { status: 409 },
    );
  }

  return Response.json({ plan: result.plan, version: result.version, rejected: result.rejected });
}

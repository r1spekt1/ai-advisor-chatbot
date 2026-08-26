import { getOrCreateTraveler } from "@/lib/traveler";
import { getProfile, clearProfile } from "@/lib/profile";

export async function GET() {
  const traveler = await getOrCreateTraveler();
  const profile = await getProfile(traveler.id);
  return Response.json(profile);
}

export async function DELETE() {
  const traveler = await getOrCreateTraveler();
  await clearProfile(traveler.id);
  const profile = await getProfile(traveler.id);
  return Response.json(profile);
}

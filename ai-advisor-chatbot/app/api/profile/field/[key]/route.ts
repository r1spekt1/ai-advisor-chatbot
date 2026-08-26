import { getOrCreateTraveler } from "@/lib/traveler";
import { getProfile, clearProfileField } from "@/lib/profile";
import { RememberArgs } from "@/lib/schema";

const VALID_KEYS = Object.keys(RememberArgs.shape);

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!VALID_KEYS.includes(key)) {
    return Response.json({ error: "Unknown field." }, { status: 400 });
  }

  const traveler = await getOrCreateTraveler();
  await clearProfileField(traveler.id, key as keyof typeof RememberArgs.shape);
  const profile = await getProfile(traveler.id);
  return Response.json(profile);
}

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { traveler } from "@/lib/db/schema";
import { TravelerProfile, RememberArgs, type TravelerProfile as TravelerProfileType } from "@/lib/schema";

const emptyProfile: TravelerProfileType = {
  schemaVersion: 1,
  homeCity: null,
  homeCountry: null,
  homeCurrency: null,
  languages: [],
  interests: [],
  dietary: [],
  avoid: [],
  pace: null,
  accommodation: null,
  budgetBand: null,
  companions: [],
};

const ARRAY_UNION_KEYS = [
  "languages",
  "interests",
  "dietary",
  "avoid",
  "companions",
] as const;

export async function getProfile(travelerId: string): Promise<TravelerProfileType> {
  const [row] = await db.select().from(traveler).where(eq(traveler.id, travelerId));
  if (!row) return emptyProfile;

  const parsed = TravelerProfile.safeParse(row.profile);
  if (!parsed.success) return emptyProfile;

  return parsed.data;
}

export async function mergeProfile(
  travelerId: string,
  patch: unknown,
): Promise<{ ok: true; saved: string[] } | { ok: false; error: string }> {
  const parsed = RememberArgs.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  const current = await getProfile(travelerId);
  const next: TravelerProfileType = { ...current };
  const saved: string[] = [];

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;

    if ((ARRAY_UNION_KEYS as readonly string[]).includes(key)) {
      const existing = current[key as keyof TravelerProfileType] as unknown[];
      const incoming = value as unknown[];
      const merged =
        key === "companions"
          ? [...existing, ...incoming]
          : Array.from(new Set([...existing, ...incoming]));
      (next as Record<string, unknown>)[key] = merged;
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
    saved.push(key);
  }

  const revalidated = TravelerProfile.safeParse(next);
  if (!revalidated.success) {
    return { ok: false, error: revalidated.error.message };
  }

  await db
    .update(traveler)
    .set({ profile: revalidated.data })
    .where(eq(traveler.id, travelerId));

  return { ok: true, saved };
}

export async function clearProfile(travelerId: string): Promise<void> {
  await db
    .update(traveler)
    .set({ profile: emptyProfile })
    .where(eq(traveler.id, travelerId));
}

export async function clearProfileField(
  travelerId: string,
  field: keyof Omit<TravelerProfileType, "schemaVersion">,
): Promise<void> {
  const current = await getProfile(travelerId);
  const next: TravelerProfileType = { ...current, [field]: emptyProfile[field] };
  await db.update(traveler).set({ profile: next }).where(eq(traveler.id, travelerId));
}

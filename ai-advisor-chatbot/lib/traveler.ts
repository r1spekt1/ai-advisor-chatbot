import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { traveler, type Traveler } from "@/lib/db/schema";
import type { TravelerProfile } from "@/lib/schema";

const TRAVELER_COOKIE = "traveler_id";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 5;

const emptyProfile: TravelerProfile = {
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

// Not authentication: the cookie only identifies a browser, and losing it loses the data.
export async function getOrCreateTraveler(): Promise<Traveler> {
  const cookieStore = await cookies();
  const existingId = cookieStore.get(TRAVELER_COOKIE)?.value;

  if (existingId) {
    const [row] = await db.select().from(traveler).where(eq(traveler.id, existingId));
    if (row) return row;
  }

  const id = randomUUID();
  const [row] = await db
    .insert(traveler)
    .values({ id, profile: emptyProfile, createdAt: new Date() })
    .returning();

  cookieStore.set(TRAVELER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return row;
}

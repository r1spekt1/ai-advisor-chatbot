import { z } from "zod";
import { Id, CurrencyCode, IsoDate, Clock, ShortText, LongText } from "./primitives";

export const TripDates = z.object({
  start: IsoDate.nullable(),
  end: IsoDate.nullable(),
  flexible: z.boolean().describe("true when the traveler gave an approximate window"),
  note: ShortText.nullable().describe(
    "The traveler's own phrasing, e.g. 'mid-October, around 10 days'. " +
    "Use this when exact dates are not decided yet — do not guess dates."
  ),
}).strict();

export type TripDates = z.infer<typeof TripDates>;

export const Money = z.object({
  amount: z.number().positive().nullable(),
  currency: CurrencyCode.nullable(),
  per: z.enum(["total", "person"]),
}).strict();

export type Money = z.infer<typeof Money>;

export const PlanItem = z.object({
  id: Id,
  kind: z.enum(["activity", "food", "transport", "lodging", "note"]),
  title: ShortText,
  time: Clock.nullable(),
  location: ShortText.nullable(),
  notes: LongText.nullable(),
  cost: Money.nullable(),
  locked: z.boolean().describe(
    "Set by the app when the traveler edits this item by hand. " +
    "Never modify or remove a locked item — suggest the change in chat instead."
  ),
}).strict();

export type PlanItem = z.infer<typeof PlanItem>;

export const PlanDay = z.object({
  id: Id,
  date: IsoDate.nullable()
    .describe("null while dates are undecided; order comes from array position"),
  label: ShortText.nullable().describe("e.g. 'Arrival', 'Day trip to Nara'"),
  items: z.array(PlanItem).max(20),
}).strict();

export type PlanDay = z.infer<typeof PlanDay>;

export const Destination = z.object({
  id: Id,
  city: ShortText,
  country: ShortText,
  nights: z.number().int().min(0).max(60).nullable(),
}).strict();

export type Destination = z.infer<typeof Destination>;

export const TripPlan = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["draft", "shaping", "ready"]),
  title: ShortText.nullable(),
  origin: ShortText.nullable(),
  destinations: z.array(Destination).max(12),
  dates: TripDates,
  party: z.object({
    adults: z.number().int().min(1).max(12),
    children: z.number().int().min(0).max(12),
  }).strict(),
  budget: Money.nullable(),
  days: z.array(PlanDay).max(30),
  openQuestions: z.array(ShortText).max(10).describe(
    "Decisions still missing. Keep this current — it drives what you ask next."
  ),
}).strict();

export type TripPlan = z.infer<typeof TripPlan>;

export function emptyPlan(): TripPlan {
  return {
    schemaVersion: 1,
    status: "draft",
    title: null,
    origin: null,
    destinations: [],
    dates: {
      start: null,
      end: null,
      flexible: false,
      note: null,
    },
    party: { adults: 1, children: 0 },
    budget: null,
    days: [],
    openQuestions: [],
  };
}

export function migrate(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") {
    return raw;
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion === undefined) {
    return { ...obj, schemaVersion: 1 };
  }
  return raw;
}

# Spec 01 — Schemas

Load this for: anything touching `lib/schema/`, tool arguments, the plan reducer.

Everything derives from this file. Write it before any feature code. Files live in
`lib/schema/` and import nothing from app code. Types come from `z.infer` only — never
hand-write an interface that duplicates a schema.

## 0. Why one schema cannot serve everything

The same shapes serve three consumers with conflicting needs:

| consumer | wants |
|---|---|
| the model (tool input) | shallow, well-described, no deep recursion |
| API + DB | strict, reject unknown keys |
| React form | precise types, partial edits |

Resolution: **one canonical state schema, with derived variants** via `.partial()`,
`.omit()`, `.pick()`. Never duplicate a field definition.

---

## 1. Primitives — `primitives.ts`

```ts
import { z } from "zod";

export const Id = z.string().min(1).max(24).describe(
  "Stable opaque id. Copy it verbatim from the current plan when editing. " +
  "Omit it to create something new — never invent an id."
);

export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/)
  .describe("ISO 4217, uppercase. EUR, USD, JPY.");

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Calendar date, YYYY-MM-DD.");

export const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .describe("Local 24h time, HH:MM.");

export const ShortText = z.string().trim().min(1).max(120);
export const LongText  = z.string().trim().max(600);
```

Two conventions applying to every schema below:

- **`.describe()` is prompt engineering, not documentation.** It becomes the field
  `description` in the JSON Schema the model reads on every call. Describe *behaviour*
  ("never invent an id"), not type — the model already sees the type. A sentence here
  beats a paragraph in the system prompt, because it sits next to the field at the
  moment the model fills it in.
- **`.max()` on every string and array.** Not for the DB — it is the only reliable way
  to stop the model or the user putting half a conversation into one field, and it keeps
  the plan panel from breaking visually.

---

## 2. Trip plan — `plan.ts`

```ts
export const TripDates = z.object({
  start: IsoDate.nullable(),
  end: IsoDate.nullable(),
  flexible: z.boolean().describe("true when the traveler gave an approximate window"),
  note: ShortText.nullable().describe(
    "The traveler's own phrasing, e.g. 'mid-October, around 10 days'. " +
    "Use this when exact dates are not decided yet — do not guess dates."
  ),
}).strict();

export const Money = z.object({
  amount: z.number().positive().nullable(),
  currency: CurrencyCode.nullable(),
  per: z.enum(["total", "person"]),
}).strict();

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

export const PlanDay = z.object({
  id: Id,
  date: IsoDate.nullable()
    .describe("null while dates are undecided; order comes from array position"),
  label: ShortText.nullable().describe("e.g. 'Arrival', 'Day trip to Nara'"),
  items: z.array(PlanItem).max(20),
}).strict();

export const Destination = z.object({
  id: Id,
  city: ShortText,
  country: ShortText,
  nights: z.number().int().min(0).max(60).nullable(),
}).strict();

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
```

Also export `emptyPlan(): TripPlan` — a valid draft with empty arrays,
`party: { adults: 1, children: 0 }`, nulls elsewhere.

**Decisions to preserve through any refactor:**

- **`nullable()` rather than `optional()` almost everywhere.** `optional` means "the key
  may be missing", and the model then silently omits it — you cannot tell "no data" from
  "forgot". Required + nullable means the key is always present and `null` is an explicit
  "not decided yet". A plan that *takes shape* must distinguish those.
- **`TripDates.note` absorbs imprecision.** Without it, "sometime mid-October" forces the
  model to invent `2026-10-15`.
- **`locked` is the most load-bearing boolean in the project.** `trip.version` catches
  *simultaneous* conflicts; `locked` catches *deferred* ones — the traveler hand-edits a
  hotel, the model regenerates that day later and overwrites it. Without this, "adjust
  individual parts of it" does not actually hold.
- **`openQuestions` is beyond the brief.** Cheap, and it gives the panel a "still to
  decide" section while pushing the advisor to drive instead of wait.
- **`schemaVersion` as `z.literal(1)`.** The schema will change mid-build. Write
  `migrate(raw): unknown` that inspects it before parsing, so demo data survives.

---

## 3. Plan operations — `ops.ts`

```ts
const ItemDraft = PlanItem.omit({ id: true, locked: true }).partial().extend({
  id: Id.optional().describe("Existing item id to edit; omit to create a new item."),
  title: ShortText,
});

const DayDraft = PlanDay.omit({ id: true, items: true }).partial().extend({
  id: Id.optional(),
});

const DestinationDraft = Destination.omit({ id: true }).partial().extend({
  id: Id.optional(),
  city: ShortText,
  country: ShortText,
});

export const PlanOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_meta"),
    title: ShortText.nullish(),
    status: TripPlan.shape.status.optional(),
    origin: ShortText.nullish() }).strict(),
  z.object({ op: z.literal("set_dates"), dates: TripDates }).strict(),
  z.object({ op: z.literal("set_budget"), budget: Money.nullable() }).strict(),
  z.object({ op: z.literal("set_party"), party: TripPlan.shape.party }).strict(),
  z.object({ op: z.literal("set_open_questions"),
    questions: z.array(ShortText).max(10) }).strict(),

  z.object({ op: z.literal("upsert_destination"),
    destination: DestinationDraft }).strict(),
  z.object({ op: z.literal("remove_destination"), destinationId: Id }).strict(),

  z.object({ op: z.literal("upsert_day"), day: DayDraft }).strict(),
  z.object({ op: z.literal("remove_day"), dayId: Id }).strict(),

  z.object({ op: z.literal("upsert_item"), dayId: Id, item: ItemDraft }).strict(),
  z.object({ op: z.literal("remove_item"), dayId: Id, itemId: Id }).strict(),
]);

export const UpdatePlanArgs = z.object({
  ops: z.array(PlanOp).min(1).max(20),
  rationale: ShortText
    .describe("One short line shown to the traveler explaining the change."),
}).strict();
```

**Ops, not RFC-7396 merge-patch.** Merge-patch works for scalars and breaks on arrays:
it cannot edit one array element, so it replaces the whole `days` array — which wipes
`locked` items. Ops are more verbose and are the only form that expresses "touch only
this".

**The union is nested, not top-level.** A union at the root of a tool input becomes a
root-level `anyOf`, which models fill in less reliably. Here the root is a plain object
with `ops` and `rationale`. Inside, the discriminated union buys an exhaustive `switch`
in the reducer — TypeScript errors if an op is added and not handled.

**The UI dispatches the same ops.** One pure reducer:

```ts
applyOps(plan: TripPlan, ops: PlanOp[]): { plan: TripPlan; rejected: string[] }
```

No I/O, trivially testable. Model and user go through identical code. `rejected` collects
ops refused for targeting a `locked` item — return these to the model as part of the tool
result so it can tell the traveler.

Manual UI edits set `locked: true` on the touched item. Reordering ops
(`reorder_days`, `move_item`) are deliberately absent — they require drag-and-drop, which
is on the cut list.

---

## 4. Traveler profile — `profile.ts`

```ts
export const TravelerProfile = z.object({
  schemaVersion: z.literal(1),
  homeCity: ShortText.nullable(),
  homeCountry: ShortText.nullable(),
  homeCurrency: CurrencyCode.nullable(),
  languages: z.array(z.string().regex(/^[a-z]{2}$/)).max(5),
  interests: z.array(ShortText).max(12),
  dietary: z.array(ShortText).max(8),
  avoid: z.array(ShortText).max(8)
    .describe("Things the traveler dislikes or wants to skip."),
  pace: z.enum(["relaxed", "balanced", "packed"]).nullable(),
  accommodation: z.enum(["hostel", "midrange", "boutique", "apartment", "luxury"])
    .nullable(),
  budgetBand: z.enum(["shoestring", "moderate", "comfortable", "premium"]).nullable(),
  companions: z.array(z.object({
    id: Id,
    relation: z.enum(["partner", "child", "parent", "friend", "colleague", "other"]),
    ageBand: z.enum(["infant", "child", "teen", "adult", "senior"]).nullable(),
    note: ShortText.nullable(),
  }).strict()).max(8),
}).strict();

export const RememberArgs = TravelerProfile
  .omit({ schemaVersion: true })
  .partial()
  .strict()
  .describe(
    "Save durable facts about the traveler for future conversations. " +
    "Only stable preferences — never passport numbers, ID numbers, payment details, " +
    "dates of birth, addresses, or health information. " +
    "Trip-specific details belong in the plan, not here."
  );
```

**This schema is the privacy control. The reasoning must survive refactors:**

- **The schema *is* the denylist.** There is no field for a passport number, and
  `.strict()` rejects unknown keys. So even if the traveler dictates one, the model tries
  to store it, and the prompt text fails — `RememberArgs.parse()` throws and it never
  lands. A *structural* guarantee, not a behavioural one. A regex denylist may be a
  second layer, never the only one: regex catches what you thought of, the schema catches
  what you did not.
- **`budgetBand` is a band, not a number — deliberately asymmetric.** The exact figure
  lives in `TripPlan.budget`: needed for planning, scoped to one trip, deleted with it.
  Only the coarse band persists long-term. Layered retention; belongs in the README.
- **`companions` carries no names.** `relation` + `ageBand` give the model what planning
  needs ("travelling with a 6-year-old") without storing PII about a third party who
  never consented. `note` is free text, so the profile page must show and delete it.
- **Deliberately absent:** name, contact details, date of birth, document numbers,
  health/mobility needs. The last is tempting because it genuinely helps planning, but it
  is a special category of data — omitting it and explaining why is the stronger answer.

**Why this rather than RAG over past messages.** Raw PII in embeddings, non-deterministic
retrieval, and at this scale worse precision than fifteen structured fields. Also not
inspectable or deletable by the traveler. State this in the README as a decision, not an
omission.

---

## 5. Tool arguments — `tools.ts`

```ts
export const WeatherArgs = z.object({
  city: ShortText,
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
  days: z.number().int().min(1).max(14),
}).strict();

export const FxArgs = z.object({
  from: CurrencyCode,
  to: CurrencyCode,
  amount: z.number().positive().max(1_000_000).nullable(),
}).strict();

export const SearchArgs = z.object({
  query: z.string().trim().min(3).max(200)
    .refine(q => !/\d{6,}/.test(q), "Query must not contain long digit sequences.")
    .refine(q => !/[\w.+-]+@[\w-]+\.\w+/.test(q), "Query must not contain email addresses."),
  recency: z.enum(["any", "month", "year"]),
}).strict();

export const ToolResult = z.object({
  ok: z.boolean(),
  source: z.string(),      // "open-meteo.com"
  fetchedAt: z.string(),   // ISO timestamp
  data: z.unknown().nullable(),
  error: z.string().nullable(),
}).strict();
```

**No tool accepts free text that goes straight out.** Weather takes a city and a day
count — not "context". FX takes three letters. Search takes a query, but `.refine()`
rejects long digit runs (passport, card, national ID) and email addresses. When the model
tries to put PII into an outbound call, the parse fails and it gets a structured error
back.

`fetchedAt` + `source` answer the brief's "getting it right is the goal" — the advisor
can state where a number came from and when. `ok: false` with a message is why the model
says "I can't check that right now" instead of inventing a rate.

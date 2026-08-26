import { z } from "zod";
import { Id } from "./primitives";
import { TripPlan, TripDates, Money, PlanItem, PlanDay, Destination } from "./plan";

// Tool-only, looser than the stored plan's ShortText/LongText — the model's raw
// output is clamped with truncate() before it ever reaches TripPlan.safeParse.
const LooseShort = z.string().trim().min(1).max(300);
const LooseLong  = z.string().trim().max(2000);

const ItemDraft = PlanItem.omit({ id: true, locked: true }).partial().extend({
  id: Id.optional().describe("Existing item id to edit; omit to create a new item."),
  title: z.string().trim().min(1).max(300).describe(
    "Item title. Aim for under 100 characters — longer text is shortened when saved."
  ),
  location: LooseShort.nullable().optional(),
  notes: LooseLong.nullable().optional(),
});

const DayDraft = PlanDay.omit({ id: true, items: true }).partial().extend({
  id: Id.optional(),
  label: LooseShort.nullable().optional(),
});

const DestinationDraft = Destination.omit({ id: true }).partial().extend({
  id: Id.optional(),
  city: LooseShort,
  country: LooseShort,
});

export const PlanOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_meta"),
    title: LooseShort.nullish(),
    status: TripPlan.shape.status.optional(),
    origin: LooseShort.nullish() }).strict(),
  z.object({ op: z.literal("set_dates"), dates: TripDates }).strict(),
  z.object({ op: z.literal("set_budget"), budget: Money.nullable() }).strict(),
  z.object({ op: z.literal("set_party"), party: TripPlan.shape.party }).strict(),
  z.object({ op: z.literal("set_open_questions"),
    questions: z.array(LooseShort).max(30) }).strict(),

  z.object({ op: z.literal("upsert_destination"),
    destination: DestinationDraft }).strict(),
  z.object({ op: z.literal("remove_destination"), destinationId: Id }).strict(),

  z.object({ op: z.literal("upsert_day"), day: DayDraft }).strict(),
  z.object({ op: z.literal("remove_day"), dayId: Id }).strict(),

  z.object({ op: z.literal("upsert_item"), dayId: Id, item: ItemDraft }).strict(),
  z.object({ op: z.literal("remove_item"), dayId: Id, itemId: Id }).strict(),
]);

export type PlanOp = z.infer<typeof PlanOp>;

export const UpdatePlanArgs = z.object({
  ops: z.array(PlanOp).min(1).max(60),
  rationale: z.string().trim().min(1).max(400).describe(
    "One short line (aim for under 120 characters) shown to the traveler explaining " +
    "the change; longer text is shortened."
  ),
}).strict();

export type UpdatePlanArgs = z.infer<typeof UpdatePlanArgs>;

let idCounter = 0;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trim() : text;
}

function genId(existing: Set<string>): string {
  let candidate: string;
  do {
    idCounter += 1;
    candidate = `id${idCounter.toString(36)}`;
  } while (existing.has(candidate));
  existing.add(candidate);
  return candidate;
}

function collectAllIds(plan: TripPlan): Set<string> {
  const ids = new Set<string>();
  for (const d of plan.destinations) ids.add(d.id);
  for (const day of plan.days) {
    ids.add(day.id);
    for (const item of day.items) ids.add(item.id);
  }
  return ids;
}

export function applyOps(
  plan: TripPlan,
  ops: PlanOp[],
  source: "user" | "model" = "model",
): { plan: TripPlan; rejected: string[] } {
  let next: TripPlan = plan;
  const rejected: string[] = [];
  const allIds = collectAllIds(plan);

  for (const op of ops) {
    switch (op.op) {
      case "set_meta": {
        next = {
          ...next,
          title: op.title !== undefined ? (op.title !== null ? truncate(op.title, 120) : null) : next.title,
          status: op.status ?? next.status,
          origin: op.origin !== undefined ? (op.origin !== null ? truncate(op.origin, 120) : null) : next.origin,
        };
        break;
      }
      case "set_dates": {
        next = { ...next, dates: op.dates };
        break;
      }
      case "set_budget": {
        next = { ...next, budget: op.budget };
        break;
      }
      case "set_party": {
        next = { ...next, party: op.party };
        break;
      }
      case "set_open_questions": {
        next = { ...next, openQuestions: op.questions.map(q => truncate(q, 120)) };
        break;
      }
      case "upsert_destination": {
        const { id, ...rest } = op.destination;
        if (id !== undefined) {
          const idx = next.destinations.findIndex(d => d.id === id);
          if (idx === -1) {
            rejected.push(op.op);
            break;
          }
          const destinations = next.destinations.slice();
          destinations[idx] = {
            ...destinations[idx],
            ...rest,
            ...(rest.city !== undefined ? { city: truncate(rest.city, 120) } : {}),
            ...(rest.country !== undefined ? { country: truncate(rest.country, 120) } : {}),
            id,
          };
          next = { ...next, destinations };
        } else {
          const newId = genId(allIds);
          next = {
            ...next,
            destinations: [
              ...next.destinations,
              {
                id: newId,
                city: truncate(rest.city, 120),
                country: truncate(rest.country, 120),
                nights: rest.nights ?? null,
              },
            ],
          };
        }
        break;
      }
      case "remove_destination": {
        next = {
          ...next,
          destinations: next.destinations.filter(d => d.id !== op.destinationId),
        };
        break;
      }
      case "upsert_day": {
        const { id, ...rest } = op.day;
        if (id !== undefined) {
          const idx = next.days.findIndex(d => d.id === id);
          if (idx === -1) {
            rejected.push(op.op);
            break;
          }
          const days = next.days.slice();
          days[idx] = {
            ...days[idx],
            ...rest,
            ...(rest.label !== undefined ? { label: rest.label !== null ? truncate(rest.label, 120) : null } : {}),
            id,
          };
          next = { ...next, days };
        } else {
          const newId = genId(allIds);
          next = {
            ...next,
            days: [
              ...next.days,
              {
                id: newId,
                date: rest.date ?? null,
                label: rest.label !== undefined && rest.label !== null ? truncate(rest.label, 120) : null,
                items: [],
              },
            ],
          };
        }
        break;
      }
      case "remove_day": {
        const day = next.days.find(d => d.id === op.dayId);
        if (day && source !== "user" && day.items.some(i => i.locked)) {
          rejected.push(op.op);
          break;
        }
        next = { ...next, days: next.days.filter(d => d.id !== op.dayId) };
        break;
      }
      case "upsert_item": {
        const dayIdx = next.days.findIndex(d => d.id === op.dayId);
        if (dayIdx === -1) {
          rejected.push(op.op);
          break;
        }
        const day = next.days[dayIdx];
        const { id, ...rest } = op.item;
        if (id !== undefined) {
          const itemIdx = day.items.findIndex(i => i.id === id);
          if (itemIdx === -1) {
            rejected.push(op.op);
            break;
          }
          if (source !== "user" && day.items[itemIdx].locked) {
            rejected.push(op.op);
            break;
          }
          const items = day.items.slice();
          items[itemIdx] = {
            ...items[itemIdx],
            ...rest,
            ...(rest.title !== undefined ? { title: truncate(rest.title, 120) } : {}),
            ...(rest.location !== undefined
              ? { location: rest.location !== null ? truncate(rest.location, 120) : null }
              : {}),
            ...(rest.notes !== undefined
              ? { notes: rest.notes !== null ? truncate(rest.notes, 600) : null }
              : {}),
            id,
            locked: source === "user" ? true : items[itemIdx].locked,
          };
          const days = next.days.slice();
          days[dayIdx] = { ...day, items };
          next = { ...next, days };
        } else {
          const newId = genId(allIds);
          const newItem = {
            id: newId,
            kind: rest.kind ?? "activity",
            title: truncate(rest.title, 120),
            time: rest.time ?? null,
            location: rest.location != null ? truncate(rest.location, 120) : null,
            notes: rest.notes != null ? truncate(rest.notes, 600) : null,
            cost: rest.cost ?? null,
            locked: source === "user",
          };
          const days = next.days.slice();
          days[dayIdx] = { ...day, items: [...day.items, newItem] };
          next = { ...next, days };
        }
        break;
      }
      case "remove_item": {
        const dayIdx = next.days.findIndex(d => d.id === op.dayId);
        if (dayIdx === -1) {
          rejected.push(op.op);
          break;
        }
        const day = next.days[dayIdx];
        const item = day.items.find(i => i.id === op.itemId);
        if (!item) {
          rejected.push(op.op);
          break;
        }
        if (source !== "user" && item.locked) {
          rejected.push(op.op);
          break;
        }
        const days = next.days.slice();
        days[dayIdx] = { ...day, items: day.items.filter(i => i.id !== op.itemId) };
        next = { ...next, days };
        break;
      }
      default: {
        const _exhaustive: never = op;
        void _exhaustive;
      }
    }
  }

  return { plan: next, rejected };
}

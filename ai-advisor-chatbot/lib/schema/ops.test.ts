import { describe, it, expect } from "vitest";
import { applyOps } from "./ops";
import { emptyPlan, TripPlan as TripPlanSchema } from "./plan";
import type { TripPlan } from "./plan";

function planWithLockedItem(): TripPlan {
  const plan = emptyPlan();
  return {
    ...plan,
    days: [
      {
        id: "day1",
        date: null,
        label: "Day 1",
        items: [
          {
            id: "item1",
            kind: "activity",
            title: "Museum visit",
            time: null,
            location: null,
            notes: null,
            cost: null,
            locked: true,
          },
        ],
      },
    ],
  };
}

describe("locked items block the model, not the traveler", () => {
  it("rejects the model editing a locked item", () => {
    const plan = planWithLockedItem();
    const { plan: next, rejected } = applyOps(
      plan,
      [{ op: "upsert_item", dayId: "day1", item: { id: "item1", title: "Changed" } }],
      "model",
    );
    expect(rejected).toEqual(["upsert_item"]);
    expect(next.days[0].items[0].title).toBe("Museum visit");
  });

  it("rejects the model deleting a locked item", () => {
    const plan = planWithLockedItem();
    const { plan: next, rejected } = applyOps(
      plan,
      [{ op: "remove_item", dayId: "day1", itemId: "item1" }],
      "model",
    );
    expect(rejected).toEqual(["remove_item"]);
    expect(next.days[0].items).toHaveLength(1);
  });

  it("lets the traveler edit their own locked item", () => {
    const plan = planWithLockedItem();
    const { plan: next, rejected } = applyOps(
      plan,
      [{ op: "upsert_item", dayId: "day1", item: { id: "item1", title: "Changed" } }],
      "user",
    );
    expect(rejected).toEqual([]);
    expect(next.days[0].items[0].title).toBe("Changed");
    expect(next.days[0].items[0].locked).toBe(true);
  });

  it("locks an item the traveler edits by hand", () => {
    const plan = emptyPlan();
    const withDay = applyOps(plan, [{ op: "upsert_day", day: {} }], "user").plan;
    const dayId = withDay.days[0].id;

    const { plan: next } = applyOps(
      withDay,
      [{ op: "upsert_item", dayId, item: { title: "Hand-added item" } }],
      "user",
    );
    expect(next.days[0].items[0].locked).toBe(true);
  });

  it("does not lock an item the model creates", () => {
    const plan = emptyPlan();
    const withDay = applyOps(plan, [{ op: "upsert_day", day: {} }], "model").plan;
    const dayId = withDay.days[0].id;

    const { plan: next } = applyOps(
      withDay,
      [{ op: "upsert_item", dayId, item: { title: "Model-added item" } }],
      "model",
    );
    expect(next.days[0].items[0].locked).toBe(false);
  });

  it("lets the traveler remove a day containing a locked item", () => {
    const plan = planWithLockedItem();
    const { plan: next, rejected } = applyOps(
      plan,
      [{ op: "remove_day", dayId: "day1" }],
      "user",
    );
    expect(rejected).toEqual([]);
    expect(next.days).toHaveLength(0);
  });

  it("rejects the model removing a day containing a locked item", () => {
    const plan = planWithLockedItem();
    const { plan: next, rejected } = applyOps(
      plan,
      [{ op: "remove_day", dayId: "day1" }],
      "model",
    );
    expect(rejected).toEqual(["remove_day"]);
    expect(next.days).toHaveLength(1);
  });
});

describe("upsert_item truncates oversized text before it hits TripPlan", () => {
  it("clamps a 250-char title and 900-char notes and still parses", () => {
    const plan = emptyPlan();
    const withDay = applyOps(plan, [{ op: "upsert_day", day: {} }], "model").plan;
    const dayId = withDay.days[0].id;

    const longTitle = "T".repeat(250);
    const longNotes = "N".repeat(900);

    const { plan: next } = applyOps(
      withDay,
      [{ op: "upsert_item", dayId, item: { title: longTitle, notes: longNotes } }],
      "model",
    );

    const item = next.days[0].items[0];
    expect(item.title.length).toBeLessThanOrEqual(120);
    expect(item.notes?.length).toBeLessThanOrEqual(600);

    const result = TripPlanSchema.safeParse(next);
    expect(result.success).toBe(true);
  });
});

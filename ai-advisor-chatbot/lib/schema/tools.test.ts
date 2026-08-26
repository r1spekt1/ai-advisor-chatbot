import { describe, it, expect } from "vitest";
import { SearchArgs } from "./tools";
import { RememberArgs } from "./profile";

describe("outbound query validation", () => {
  it("rejects long digit sequences", () => {
    expect(SearchArgs.safeParse({
      query: "visa rules passport 123456789012", recency: "any",
    }).success).toBe(false);
  });

  it("rejects email addresses", () => {
    expect(SearchArgs.safeParse({
      query: "visa rules for pavle@example.com", recency: "any",
    }).success).toBe(false);
  });

  it("accepts an ordinary query", () => {
    expect(SearchArgs.safeParse({
      query: "Japan visa requirements for Montenegrin citizens", recency: "year",
    }).success).toBe(true);
  });
});

describe("profile schema is the denylist", () => {
  it("rejects a field it does not define", () => {
    expect(RememberArgs.safeParse({
      homeCity: "Podgorica", passportNumber: "123456789",
    }).success).toBe(false);
  });
});

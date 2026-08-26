import { z } from "zod";
import { Id, CurrencyCode, ShortText } from "./primitives";

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

export type TravelerProfile = z.infer<typeof TravelerProfile>;

export const RememberArgs = TravelerProfile
  .omit({ schemaVersion: true })
  .partial()
  .strict()
  .describe(
    "Save durable facts about the traveler for future conversations. " +
    "Only stable preferences — never passport numbers, ID numbers, payment details, " +
    "dates of birth, or addresses. " +
    "Allergies and medical information stay out of memory too — use them within the " +
    "conversation only, and say so briefly when the traveler mentions one. " +
    "Trip-specific details belong in the plan, not here."
  );

export type RememberArgs = z.infer<typeof RememberArgs>;

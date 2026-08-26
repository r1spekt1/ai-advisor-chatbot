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

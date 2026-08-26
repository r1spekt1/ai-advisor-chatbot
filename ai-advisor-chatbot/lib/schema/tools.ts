import { z } from "zod";
import { CurrencyCode, ShortText } from "./primitives";

export const WeatherArgs = z.object({
  city: ShortText,
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
  days: z.number().int().min(1).max(14),
}).strict();

export type WeatherArgs = z.infer<typeof WeatherArgs>;

export const FxArgs = z.object({
  from: CurrencyCode,
  to: CurrencyCode,
  amount: z.number().positive().max(1_000_000).nullable(),
}).strict();

export type FxArgs = z.infer<typeof FxArgs>;

export const SearchArgs = z.object({
  query: z.string().trim().min(3).max(200)
    .refine(q => !/\d{6,}/.test(q), "Query must not contain long digit sequences.")
    .refine(q => !/[\w.+-]+@[\w-]+\.\w+/.test(q), "Query must not contain email addresses."),
  recency: z.enum(["any", "month", "year"]),
}).strict();

export type SearchArgs = z.infer<typeof SearchArgs>;

export const ToolResult = z.object({
  ok: z.boolean(),
  source: z.string(),
  fetchedAt: z.string(),
  data: z.unknown().nullable(),
  error: z.string().nullable(),
}).strict();

export type ToolResult = z.infer<typeof ToolResult>;

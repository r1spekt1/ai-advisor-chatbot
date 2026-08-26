// Compose passes blank .env entries through as "" rather than leaving them
// unset, so `??` never fires and the fallback is skipped. A reviewer copying
// .env.example verbatim would get model: "" and threshold: Number("") === 0.
// Treat blank as absent everywhere.

export function envString(value: string | undefined, fallback: string): string {
  const v = value?.trim();
  return v ? v : fallback;
}

export function envNumber(value: string | undefined, fallback: number): number {
  const v = value?.trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

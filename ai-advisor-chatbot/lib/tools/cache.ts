type Entry = { expiresAt: number; value: unknown };

const store = new Map<string, Entry>();

function hashKey(name: string, args: unknown): string {
  const json = JSON.stringify(args, Object.keys(args as object ?? {}).sort());
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (Math.imul(31, hash) + json.charCodeAt(i)) | 0;
  }
  return `${name}:${hash}:${json.length}`;
}

export async function withCache<T>(
  toolName: string,
  args: unknown,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const key = hashKey(toolName, args);
  const cached = store.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }
  const value = await fetcher();
  store.set(key, { expiresAt: now + ttlMs, value });
  return value;
}

export const TTL = {
  weather: 60 * 60 * 1000,
  fx: 12 * 60 * 60 * 1000,
  search: 24 * 60 * 60 * 1000,
};

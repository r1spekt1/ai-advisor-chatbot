import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { envString } from "../env";

function createDb() {
  const file = envString(process.env.DATABASE_PATH, "./data/app.db");
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

type Db = ReturnType<typeof createDb>;

let instance: Db | null = null;

function getDb(): Db {
  instance ??= createDb();
  return instance;
}

// Lazy on purpose: opening the database at module load breaks `next build`,
// which imports route modules to collect page data before any volume exists.
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});
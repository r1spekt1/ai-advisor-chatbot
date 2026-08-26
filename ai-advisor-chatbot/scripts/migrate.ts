import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { envString } from "../lib/env";

const dbPath = envString(process.env.DATABASE_PATH, "./data/app.db");
mkdirSync(dirname(dbPath), { recursive: true });

const folder = "./drizzle";
if (!existsSync(folder) || readdirSync(folder).length === 0) {
  console.log("[migrate] no migrations yet, skipping");
  process.exit(0);
}

migrate(drizzle(new Database(dbPath)), { migrationsFolder: folder });
console.log("[migrate] done");
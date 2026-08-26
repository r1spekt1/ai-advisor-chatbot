import { defineConfig } from "drizzle-kit";
import { envString } from "./lib/env";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: envString(process.env.DATABASE_PATH, "./data/app.db"),
  },
});
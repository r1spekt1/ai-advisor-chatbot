import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { TravelerProfile, TripPlan } from "@/lib/schema";

export const traveler = sqliteTable("traveler", {
  id: text("id").primaryKey(),
  profile: text("profile", { mode: "json" }).$type<TravelerProfile>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const trip = sqliteTable("trip", {
  id: text("id").primaryKey(),
  travelerId: text("traveler_id")
    .notNull()
    .references(() => traveler.id),
  plan: text("plan", { mode: "json" }).$type<TripPlan>().notNull(),
  version: integer("version").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const conversation = sqliteTable("conversation", {
  id: text("id").primaryKey(),
  travelerId: text("traveler_id")
    .notNull()
    .references(() => traveler.id),
  tripId: text("trip_id").references(() => trip.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  summarizedUptoMessageId: text("summarized_upto_message_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const message = sqliteTable(
  "message",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    parts: text("parts", { mode: "json" }).$type<unknown[]>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("message_conversation_id_created_at_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey().default(1),
  personaPrompt: text("persona_prompt").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type Traveler = typeof traveler.$inferSelect;
export type NewTraveler = typeof traveler.$inferInsert;

export type Trip = typeof trip.$inferSelect;
export type NewTrip = typeof trip.$inferInsert;

export type Conversation = typeof conversation.$inferSelect;
export type NewConversation = typeof conversation.$inferInsert;

export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

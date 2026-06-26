import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const digestsTable = pgTable("digests", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // "morning" | "evening" | "reactive"
  content: text("content").notNull(),
  agentOutputs: jsonb("agent_outputs"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDigestSchema = createInsertSchema(digestsTable).omit({ id: true, createdAt: true });
export type InsertDigest = z.infer<typeof insertDigestSchema>;
export type Digest = typeof digestsTable.$inferSelect;

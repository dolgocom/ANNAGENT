import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentMemoryTable = pgTable("agent_memory", {
  id: serial("id").primaryKey(),
  agentName: text("agent_name").notNull(),
  memoryKey: text("memory_key").notNull(),
  memoryValue: jsonb("memory_value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentMemorySchema = createInsertSchema(agentMemoryTable).omit({ id: true, updatedAt: true });
export type InsertAgentMemory = z.infer<typeof insertAgentMemorySchema>;
export type AgentMemory = typeof agentMemoryTable.$inferSelect;

import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cosInputsTable = pgTable("cos_inputs", {
  id: serial("id").primaryKey(),
  inputType: text("input_type").notNull(), // "morning_checklist" | "decision_request" | "free_text"
  telegramMessageId: text("telegram_message_id"),
  telegramChatId: text("telegram_chat_id"),
  rawText: text("raw_text").notNull(),
  parsedData: jsonb("parsed_data"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCosInputSchema = createInsertSchema(cosInputsTable).omit({ id: true, createdAt: true });
export type InsertCosInput = z.infer<typeof insertCosInputSchema>;
export type CosInput = typeof cosInputsTable.$inferSelect;

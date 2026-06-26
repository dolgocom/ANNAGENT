import { pgTable, serial, text, integer, real, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const biometricsTable = pgTable("biometrics", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  readinessScore: integer("readiness_score"),
  hrv: real("hrv"),
  restingHeartRate: integer("resting_heart_rate"),
  sleepScore: integer("sleep_score"),
  sleepDurationHours: real("sleep_duration_hours"),
  energyLevel: integer("energy_level"),
  focusLevel: integer("focus_level"),
  moodLevel: integer("mood_level"),
  hadWorkout: text("had_workout"),
  hadMassage: text("had_massage"),
  hadAlcohol: text("had_alcohol"),
  notes: text("notes"),
  dataSource: text("data_source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBiometricsSchema = createInsertSchema(biometricsTable).omit({ id: true, createdAt: true });
export type InsertBiometrics = z.infer<typeof insertBiometricsSchema>;
export type Biometrics = typeof biometricsTable.$inferSelect;

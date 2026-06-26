import { callClaude } from "../lib/anthropic";
import { db } from "@workspace/db";
import { biometricsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface NeuroBioInput {
  readinessScore?: number;
  hrv?: number;
  sleepScore?: number;
  sleepDurationHours?: number;
  restingHeartRate?: number;
  energyLevel?: number;
  focusLevel?: number;
  moodLevel?: number;
  hadWorkout?: string;
  hadMassage?: string;
  hadAlcohol?: string;
  todayScheduleDescription?: string;
  dataIncomplete?: boolean;
}

export interface NeuroBioOutput {
  status: "alert" | "watch" | "ok";
  readiness_score: number | null;
  signal_type: "urgent" | "proactive" | "info";
  recommendation: string;
  suggested_window?: string;
  recovery_actions: string[];
  protected_blocks: string[];
  decision_owner: "Anna";
  data_incomplete: boolean;
  reasoning: string;
}

const SYSTEM_PROMPT = `Ты — Neuro & Bio Intelligence Agent системы LOS (Life Operating System).

Твоя задача: анализировать физическое, психологическое и ментальное состояние владельца холдинга и давать конкретные рекомендации по графику.

ПРАВИЛА:
1. Никогда не переносишь встречи самостоятельно — только рекомендуешь
2. Не ставишь медицинские диагнозы  
3. Не трогаешь блоки "Семья / личная жизнь"
4. Отвечаешь ТОЛЬКО на русском языке
5. Отвечаешь строго в формате JSON без markdown-блоков

ПОРОГИ:
- Readiness < 70 → статус "alert", флаг срочности
- Readiness 70-80 → статус "watch", проактивные рекомендации
- Readiness > 80 → статус "ok"

ФОРМАТ ОТВЕТА (строгий JSON):
{
  "status": "alert|watch|ok",
  "readiness_score": число или null,
  "signal_type": "urgent|proactive|info",
  "recommendation": "конкретная рекомендация",
  "suggested_window": "оптимальное окно для важных задач или null",
  "recovery_actions": ["действие 1", "действие 2"],
  "protected_blocks": ["блок 1"],
  "decision_owner": "Anna",
  "data_incomplete": true/false,
  "reasoning": "краткое объяснение логики"
}`;

export async function runNeuroBioAgent(input: NeuroBioInput): Promise<NeuroBioOutput> {
  const recent = await db
    .select()
    .from(biometricsTable)
    .orderBy(desc(biometricsTable.createdAt))
    .limit(7);

  const historyStr = recent.length > 0
    ? recent.map(r => `${r.date}: Readiness=${r.readinessScore ?? "н/д"}, HRV=${r.hrv ?? "н/д"}, Сон=${r.sleepDurationHours ?? "н/д"}ч, Энергия=${r.energyLevel ?? "н/д"}/10`).join("\n")
    : "История отсутствует";

  const userMessage = `ТЕКУЩИЕ ДАННЫЕ:
- Readiness Score (Oura): ${input.readinessScore ?? "нет данных"}
- HRV: ${input.hrv ?? "нет данных"}
- ЧСС в покое: ${input.restingHeartRate ?? "нет данных"}
- Сон (оценка): ${input.sleepScore ?? "нет данных"}
- Сон (часов): ${input.sleepDurationHours ?? "нет данных"}
- Энергия (субъективно): ${input.energyLevel ?? "нет данных"}/10
- Фокус (субъективно): ${input.focusLevel ?? "нет данных"}/10
- Настроение: ${input.moodLevel ?? "нет данных"}/10
- Тренировка сегодня: ${input.hadWorkout ?? "нет данных"}
- Массаж утром: ${input.hadMassage ?? "нет данных"}
- Алкоголь вчера: ${input.hadAlcohol ?? "нет данных"}
- Данные Oura доступны: ${input.dataIncomplete ? "НЕТ (неполные)" : "ДА"}

РАСПИСАНИЕ СЕГОДНЯ:
${input.todayScheduleDescription ?? "не предоставлено"}

ИСТОРИЯ (последние 7 дней):
${historyStr}

Проведи анализ и дай рекомендацию.`;

  try {
    const raw = await callClaude(SYSTEM_PROMPT, userMessage);
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(cleaned) as NeuroBioOutput;
    return result;
  } catch (err) {
    logger.error({ err }, "NeuroBio agent failed to parse response");
    return {
      status: "watch",
      readiness_score: input.readinessScore ?? null,
      signal_type: "info",
      recommendation: "Не удалось получить анализ. Рекомендуется ручная оценка состояния.",
      recovery_actions: [],
      protected_blocks: ["Семья / личная жизнь"],
      decision_owner: "Anna",
      data_incomplete: input.dataIncomplete ?? true,
      reasoning: "Ошибка парсинга ответа агента",
    };
  }
}

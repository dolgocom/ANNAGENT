import { db } from "@workspace/db";
import { biometricsTable, digestsTable } from "@workspace/db";
import { desc, eq, and, gte } from "drizzle-orm";
import { getOuraTodayData } from "../lib/oura";
import { runNeuroBioAgent, type NeuroBioInput } from "./neuro-bio";
import { runDecisionSupportAgent } from "./decision-support";
import { sendTelegramMessage, sendMorningChecklist, sendEveningDigest } from "../lib/telegram";
import { logger } from "../lib/logger";

function formatMorningDigest(
  neuroBio: Awaited<ReturnType<typeof runNeuroBioAgent>>,
  decisionSupport: Awaited<ReturnType<typeof runDecisionSupportAgent>>,
): string {
  const statusEmoji = neuroBio.status === "alert" ? "🔴" : neuroBio.status === "watch" ? "🟡" : "🟢";
  const lines: string[] = [
    `☀️ *УТРЕННИЙ ДАЙДЖЕСТ LOS*`,
    ``,
    `${statusEmoji} *Состояние*`,
    neuroBio.recommendation,
  ];

  if (neuroBio.recovery_actions.length > 0) {
    lines.push(``, `💪 *Рекомендации восстановления*`);
    neuroBio.recovery_actions.forEach(a => lines.push(`• ${a}`));
  }

  if (neuroBio.suggested_window) {
    lines.push(``, `⏰ *Оптимальное окно для важных задач*`);
    lines.push(neuroBio.suggested_window);
  }

  if (decisionSupport.priorities && decisionSupport.priorities.length > 0) {
    lines.push(``, `📋 *Приоритеты дня*`);
    decisionSupport.priorities.slice(0, 5).forEach(p => {
      const urg = p.urgency === "high" ? "🔴" : p.urgency === "medium" ? "🟡" : "🟢";
      lines.push(`${urg} ${p.task}`);
    });
  }

  if (decisionSupport.summary) {
    lines.push(``, `💡 *Сводка*`, decisionSupport.summary);
  }

  lines.push(``, `_Все решения принимает Аня_ ✓`);
  return lines.join("\n");
}

function formatEveningDigest(date: string): string {
  return [
    `🌙 *ВЕЧЕРНИЙ ДАЙДЖЕСТ LOS*`,
    ``,
    `📅 Итог дня: ${date}`,
    ``,
    `Введи вечерние данные командой /evening для получения полного анализа дня.`,
    ``,
    `_Хорошего отдыха!_ 🌙`,
  ].join("\n");
}

export async function runMorningSequence(cosInput?: {
  energyLevel?: number;
  focusLevel?: number;
  moodLevel?: number;
  hadWorkout?: string;
  hadMassage?: string;
  hadAlcohol?: string;
}): Promise<string> {
  logger.info("Starting morning sequence");

  // 1. Oura data
  const ouraData = await getOuraTodayData();
  const ouraIncomplete = !ouraData.readiness;

  // 2. Build neuro-bio input
  const neuroBioInput: NeuroBioInput = {
    readinessScore: ouraData.readiness?.score,
    hrv: ouraData.sleep?.average_hrv ?? undefined,
    sleepScore: ouraData.sleep?.score ?? undefined,
    sleepDurationHours: ouraData.sleep?.total_sleep_duration
      ? ouraData.sleep.total_sleep_duration / 3600
      : undefined,
    restingHeartRate: ouraData.sleep?.lowest_heart_rate ?? undefined,
    energyLevel: cosInput?.energyLevel,
    focusLevel: cosInput?.focusLevel,
    moodLevel: cosInput?.moodLevel,
    hadWorkout: cosInput?.hadWorkout,
    hadMassage: cosInput?.hadMassage,
    hadAlcohol: cosInput?.hadAlcohol,
    dataIncomplete: ouraIncomplete,
  };

  // Save biometrics to DB
  const today = new Date().toISOString().split("T")[0]!;
  await db.insert(biometricsTable).values({
    date: today,
    readinessScore: neuroBioInput.readinessScore ?? null,
    hrv: neuroBioInput.hrv ?? null,
    sleepScore: neuroBioInput.sleepScore ?? null,
    sleepDurationHours: neuroBioInput.sleepDurationHours ?? null,
    restingHeartRate: neuroBioInput.restingHeartRate ?? null,
    energyLevel: cosInput?.energyLevel ?? null,
    focusLevel: cosInput?.focusLevel ?? null,
    moodLevel: cosInput?.moodLevel ?? null,
    hadWorkout: cosInput?.hadWorkout ?? null,
    hadMassage: cosInput?.hadMassage ?? null,
    hadAlcohol: cosInput?.hadAlcohol ?? null,
    dataSource: ouraIncomplete ? "manual" : "oura",
  });

  // 3. Run agents sequentially
  const neuroBioResult = await runNeuroBioAgent(neuroBioInput);
  const decisionResult = await runDecisionSupportAgent({
    neuroBioState: neuroBioResult,
    mode: "morning_priorities",
  });

  // 4. Format digest
  const digest = formatMorningDigest(neuroBioResult, decisionResult);

  // 5. Save and send
  await db.insert(digestsTable).values({
    type: "morning",
    content: digest,
    agentOutputs: { neuroBio: neuroBioResult, decisionSupport: decisionResult } as any,
    sentAt: new Date(),
  });

  await sendTelegramMessage(digest);
  logger.info("Morning sequence completed");
  return digest;
}

export async function runEveningSequence(): Promise<void> {
  logger.info("Starting evening sequence");
  const today = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
  const digest = formatEveningDigest(today);

  await db.insert(digestsTable).values({
    type: "evening",
    content: digest,
    sentAt: new Date(),
  });

  await sendEveningDigest();
  logger.info("Evening sequence completed");
}

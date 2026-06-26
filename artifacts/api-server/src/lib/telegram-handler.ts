import { type Message } from "node-telegram-bot-api";
import { setChatId, sendTelegramMessage } from "./telegram";
import { runMorningSequence } from "../agents/orchestrator";
import { runDecisionSupportAgent } from "../agents/decision-support";
import { db } from "@workspace/db";
import { cosInputsTable } from "@workspace/db";
import { logger } from "./logger";

interface SessionState {
  step: string;
  data: Record<string, unknown>;
}

const sessions = new Map<number, SessionState>();

function parseYesNo(val: string): boolean | undefined {
  const v = val.toLowerCase().trim();
  if (v === "д" || v === "да" || v === "y" || v === "yes" || v === "1") return true;
  if (v === "н" || v === "нет" || v === "n" || v === "no" || v === "0") return false;
  return undefined;
}

function parseLevel(val: string): number | undefined {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 1 && n <= 10) return n;
  return undefined;
}

export async function handleTelegramMessage(msg: Message): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text ?? "";

  // Register CoS chat
  setChatId(String(chatId));

  // Save raw input
  await db.insert(cosInputsTable).values({
    inputType: "free_text",
    telegramChatId: String(chatId),
    telegramMessageId: String(msg.message_id),
    rawText: text,
  });

  // /start
  if (text === "/start") {
    await sendTelegramMessage(
      [
        "👋 *LOS — Life Operating System активирован*",
        "",
        "Добро пожаловать, Аня!",
        "",
        "Доступные команды:",
        "• `/morning` — утренний чек-лист и анализ",
        "• `/evening` — вечерний дайджест",
        "• `/decide <описание>` — анализ решения",
        "• `/status` — статус системы",
        "• `/help` — помощь",
        "",
        "Система готова к работе 🚀",
      ].join("\n"),
      String(chatId)
    );
    return;
  }

  // /help
  if (text === "/help") {
    await sendTelegramMessage(
      [
        "📖 *Справка LOS*",
        "",
        "*/morning* — запускает утренний анализ",
        "  Формат: `/morning 7 8 7 н д н`",
        "  (энергия фокус настроение тренировка массаж алкоголь)",
        "",
        "*/decide* — анализ решения",
        "  Пример: `/decide Подписывать ли контракт с Ивановым?`",
        "",
        "*/status* — проверка состояния системы",
        "",
        "Все данные: 1-10 для уровней, д/н для да/нет",
      ].join("\n"),
      String(chatId)
    );
    return;
  }

  // /status
  if (text === "/status") {
    await sendTelegramMessage(
      [
        "⚙️ *Статус LOS*",
        "",
        "🟢 Master Orchestrator — активен",
        "🟢 Neuro & Bio Agent — активен",
        "🟢 Decision Support Agent — активен",
        "🟢 Telegram Bot (CoS) — активен",
        "🟡 Health & Maintenance — Фаза 2",
        "🟡 Treasury Agent — Фаза 2",
        "🟡 Network Agent — Фаза 2",
        "🔘 Esoteric Agent — Фаза 3",
        "🔘 Communication Agent — Фаза 3",
        "",
        `🕐 Время сервера: ${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} MSK`,
      ].join("\n"),
      String(chatId)
    );
    return;
  }

  // /morning with args: /morning 7 8 7 н д н
  if (text.startsWith("/morning")) {
    const parts = text.split(/\s+/).slice(1);
    if (parts.length >= 6) {
      const energy = parseLevel(parts[0]!);
      const focus = parseLevel(parts[1]!);
      const mood = parseLevel(parts[2]!);
      const workout = parseYesNo(parts[3]!);
      const massage = parseYesNo(parts[4]!);
      const alcohol = parseYesNo(parts[5]!);

      if (
        energy !== undefined &&
        focus !== undefined &&
        mood !== undefined &&
        workout !== undefined &&
        massage !== undefined &&
        alcohol !== undefined
      ) {
        await sendTelegramMessage("⏳ Анализирую данные... Это займёт около 30 секунд.", String(chatId));

        try {
          await runMorningSequence({ energyLevel: energy, focusLevel: focus, moodLevel: mood, hadWorkout: workout, hadMassage: massage, hadAlcohol: alcohol });
        } catch (err) {
          logger.error({ err }, "Morning sequence failed");
          await sendTelegramMessage("❌ Ошибка при формировании дайджеста. Попробуй ещё раз.", String(chatId));
        }
        return;
      }
    }

    // Start interactive flow
    sessions.set(chatId, { step: "energy", data: {} });
    await sendTelegramMessage(
      "☀️ *Утренний чек-лист*\n\nОцени уровень энергии от 1 до 10:",
      String(chatId)
    );
    return;
  }

  // /evening
  if (text === "/evening") {
    await sendTelegramMessage(
      [
        "🌙 *Вечерний дайджест*",
        "",
        "Завтра в 07:00 MSK — утренний анализ.",
        "Хорошего отдыха! 🌙",
      ].join("\n"),
      String(chatId)
    );
    return;
  }

  // /decide <description>
  if (text.startsWith("/decide ")) {
    const description = text.slice("/decide ".length).trim();
    if (!description) {
      await sendTelegramMessage("Укажи описание решения: `/decide <описание>`", String(chatId));
      return;
    }

    await sendTelegramMessage("🔍 Анализирую решение...", String(chatId));

    try {
      const result = await runDecisionSupportAgent({
        mode: "decision_analysis",
        decisionDescription: description,
      });

      const da = result.decision_analysis;
      const lines = [
        "🧠 *Анализ решения*",
        "",
        `💡 *Рекомендация*: ${da?.recommendation ?? result.summary}`,
      ];

      if (da?.risks && da.risks.length > 0) {
        lines.push("", "⚠️ *Риски*");
        da.risks.forEach(r => lines.push(`• ${r}`));
      }

      if (da?.opportunities && da.opportunities.length > 0) {
        lines.push("", "✅ *Возможности*");
        da.opportunities.forEach(o => lines.push(`• ${o}`));
      }

      if (da?.optimal_timing) {
        lines.push("", `⏰ *Оптимальное время*: ${da.optimal_timing}`);
      }

      if (da?.financial_lens) lines.push("", `💰 *Финансы*: ${da.financial_lens}`);
      if (da?.physical_lens) lines.push("", `💪 *Физсостояние*: ${da.physical_lens}`);
      if (da?.reputation_lens) lines.push("", `🤝 *Репутация*: ${da.reputation_lens}`);

      lines.push("", "_Решение принимает Аня_ ✓");

      await sendTelegramMessage(lines.join("\n"), String(chatId));
    } catch (err) {
      logger.error({ err }, "Decision analysis failed");
      await sendTelegramMessage("❌ Ошибка анализа. Попробуй ещё раз.", String(chatId));
    }
    return;
  }

  // Interactive session flow
  const session = sessions.get(chatId);
  if (session) {
    await handleSessionStep(chatId, text, session);
    return;
  }

  // Default
  await sendTelegramMessage(
    "Привет! Используй /help для списка команд.",
    String(chatId)
  );
}

async function handleSessionStep(chatId: number, text: string, session: SessionState): Promise<void> {
  const data = session.data;

  switch (session.step) {
    case "energy": {
      const val = parseLevel(text);
      if (val === undefined) {
        await sendTelegramMessage("Введи число от 1 до 10:", String(chatId));
        return;
      }
      data.energy = val;
      sessions.set(chatId, { step: "focus", data });
      await sendTelegramMessage("Оцени уровень фокуса от 1 до 10:", String(chatId));
      break;
    }
    case "focus": {
      const val = parseLevel(text);
      if (val === undefined) {
        await sendTelegramMessage("Введи число от 1 до 10:", String(chatId));
        return;
      }
      data.focus = val;
      sessions.set(chatId, { step: "mood", data });
      await sendTelegramMessage("Оцени настроение от 1 до 10:", String(chatId));
      break;
    }
    case "mood": {
      const val = parseLevel(text);
      if (val === undefined) {
        await sendTelegramMessage("Введи число от 1 до 10:", String(chatId));
        return;
      }
      data.mood = val;
      sessions.set(chatId, { step: "workout", data });
      await sendTelegramMessage("Была ли тренировка? (д/н):", String(chatId));
      break;
    }
    case "workout": {
      const val = parseYesNo(text);
      if (val === undefined) {
        await sendTelegramMessage("Ответь д или н:", String(chatId));
        return;
      }
      data.workout = val;
      sessions.set(chatId, { step: "massage", data });
      await sendTelegramMessage("Был ли утренний массаж? (д/н):", String(chatId));
      break;
    }
    case "massage": {
      const val = parseYesNo(text);
      if (val === undefined) {
        await sendTelegramMessage("Ответь д или н:", String(chatId));
        return;
      }
      data.massage = val;
      sessions.set(chatId, { step: "alcohol", data });
      await sendTelegramMessage("Был ли алкоголь вчера? (д/н):", String(chatId));
      break;
    }
    case "alcohol": {
      const val = parseYesNo(text);
      if (val === undefined) {
        await sendTelegramMessage("Ответь д или н:", String(chatId));
        return;
      }
      data.alcohol = val;
      sessions.delete(chatId);

      await sendTelegramMessage("⏳ Анализирую данные... Это займёт около 30 секунд.", String(chatId));
      try {
        await runMorningSequence({
          energyLevel: data.energy as number,
          focusLevel: data.focus as number,
          moodLevel: data.mood as number,
          hadWorkout: data.workout as boolean,
          hadMassage: data.massage as boolean,
          hadAlcohol: data.alcohol as boolean,
        });
      } catch (err) {
        logger.error({ err }, "Morning sequence failed in session");
        await sendTelegramMessage("❌ Ошибка при формировании дайджеста.", String(chatId));
      }
      break;
    }
  }
}

import type { Message, CallbackQuery } from "node-telegram-bot-api";
import {
  setChatId, sendMessage, editMessage, answerCallback,
  levelKeyboard, workoutKeyboard, massageKeyboard, alcoholKeyboard,
  mainMenuKeyboard, getChatId,
} from "./telegram";
import { runMorningSequence } from "../agents/orchestrator";
import { runDecisionSupportAgent } from "../agents/decision-support";
import { db } from "@workspace/db";
import { cosInputsTable } from "@workspace/db";
import { logger } from "./logger";

// ─── Access control ────────────────────────────────────────────────────────

const ALLOWED_CHAT_IDS = new Set([243075616, 668776362]);

function isAllowed(chatId: number): boolean {
  if (ALLOWED_CHAT_IDS.has(chatId)) return true;
  logger.warn({ chatId }, "Unauthorized Telegram access attempt — ignored");
  return false;
}

// ─── Session state ─────────────────────────────────────────────────────────

interface MorningData {
  energy?: number;
  focus?: number;
  mood?: number;
  workout?: string;
  massage?: string;
  alcohol?: string;
}

const workoutLabel: Record<string, string> = {
  нет:     "❌ Не было",
  кардио:  "🏃 Кардио",
  силовая: "💪 Силовая",
  йога:    "🧘 Йога",
};
const massageLabel: Record<string, string> = {
  нет:     "❌ Не было",
  обычный: "🤲 Обычный",
  тайский: "🇹🇭 Тайский",
  другой:  "💆 Другой",
};
const alcoholLabel: Record<string, string> = {
  нет:      "❌ Не было",
  немного:  "🍷 Бокал",
  умеренно: "🍺 Умеренно",
  много:    "🥃 Много",
};

interface Session {
  step: "energy" | "focus" | "mood" | "workout" | "massage" | "alcohol" | "confirm" | "decide";
  data: MorningData;
  messageId?: number; // message to edit in-place
}

const sessions = new Map<number, Session>();

// ─── UI text builders ──────────────────────────────────────────────────────

function morningCard(data: MorningData, step: Session["step"]): string {
  const e = data.energy !== undefined ? `${data.energy}/10` : "—";
  const f = data.focus !== undefined ? `${data.focus}/10` : "—";
  const m = data.mood !== undefined ? `${data.mood}/10` : "—";
  const wo = data.workout !== undefined ? (workoutLabel[data.workout] ?? data.workout) : "—";
  const ma = data.massage !== undefined ? (massageLabel[data.massage] ?? data.massage) : "—";
  const al = data.alcohol !== undefined ? (alcoholLabel[data.alcohol] ?? data.alcohol) : "—";

  const prompts: Record<Session["step"], string> = {
    energy:  "⚡ *Уровень энергии* — выбери от 1 до 10:",
    focus:   "🎯 *Уровень фокуса* — выбери от 1 до 10:",
    mood:    "😊 *Настроение* — выбери от 1 до 10:",
    workout: "🏋️ *Тренировка — выбери тип:*",
    massage: "💆 *Массаж — выбери тип:*",
    alcohol: "🍷 *Алкоголь вчера — выбери степень:*",
    confirm: "✅ *Всё верно? Запустить анализ?*",
    decide:  "",
  };

  return [
    "☀️ *Утренний чек-лист*",
    "",
    `⚡ Энергия: ${e}`,
    `🎯 Фокус: ${f}`,
    `😊 Настроение: ${m}`,
    `🏋️ Тренировка: ${wo}`,
    `💆 Массаж: ${ma}`,
    `🍷 Алкоголь: ${al}`,
    "",
    prompts[step],
  ].join("\n");
}

function stepKeyboard(step: Session["step"]) {
  switch (step) {
    case "energy":  return levelKeyboard("m:energy",  "⚡ Энергия");
    case "focus":   return levelKeyboard("m:focus",   "🎯 Фокус");
    case "mood":    return levelKeyboard("m:mood",    "😊 Настроение");
    case "workout": return workoutKeyboard();
    case "massage": return massageKeyboard();
    case "alcohol": return alcoholKeyboard();
    case "confirm": return {
      inline_keyboard: [[
        { text: "🚀 Запустить анализ", callback_data: "m:confirm" },
        { text: "❌ Отмена", callback_data: "m:cancel" },
      ]],
    };
    default: return undefined;
  }
}

// ─── Message handler ───────────────────────────────────────────────────────

export async function handleMessage(msg: Message): Promise<void> {
  const chatId = msg.chat.id;
  if (!isAllowed(chatId)) return;

  setChatId(String(chatId));

  const text = (msg.text ?? "").trim();

  // Save input
  await db.insert(cosInputsTable).values({
    inputType: "free_text",
    telegramChatId: String(chatId),
    telegramMessageId: String(msg.message_id),
    rawText: text,
  }).catch(() => {});

  // /start
  if (text === "/start" || text === "/start@agent_orcestror_bot") {
    await sendMessage(
      [
        "👋 *LOS — Life Operating System*",
        "",
        "Привет, Аня\\! Система активирована и готова к работе\\.",
        "",
        "Выбери действие:",
      ].join("\n").replace(/\\/g, ""),
      String(chatId),
      mainMenuKeyboard(),
    );
    return;
  }

  // /help
  if (text === "/help" || text === "/help@agent_orcestror_bot") {
    await sendMessage(
      [
        "📖 *Справка LOS*",
        "",
        "*/morning* — утренний чек-лист с анализом состояния",
        "*/decide* — анализ решения через несколько линз",
        "*/status* — состояние всех агентов системы",
        "",
        "Или пиши напрямую — бот поймёт контекст\\.".replace(/\\/g, ""),
      ].join("\n"),
      String(chatId),
    );
    return;
  }

  // /morning
  if (text === "/morning" || text.startsWith("/morning ") || text === "/morning@agent_orcestror_bot") {
    await startMorningFlow(chatId);
    return;
  }

  // /status
  if (text === "/status" || text === "/status@agent_orcestror_bot") {
    await sendStatusMessage(String(chatId));
    return;
  }

  // /decide with text
  if (text.startsWith("/decide ")) {
    const description = text.slice("/decide ".length).trim();
    await runDecideFlow(chatId, description);
    return;
  }

  // /decide without text — ask to type
  if (text === "/decide" || text === "/decide@agent_orcestror_bot") {
    sessions.set(chatId, { step: "decide", data: {} });
    await sendMessage(
      "🧠 *Анализ решения*\n\nОпиши решение, которое нужно проанализировать:",
      String(chatId),
    );
    return;
  }

  // Session: user typing decision text
  const session = sessions.get(chatId);
  if (session?.step === "decide" && text && !text.startsWith("/")) {
    sessions.delete(chatId);
    await runDecideFlow(chatId, text);
    return;
  }

  // Default — show menu
  await sendMessage(
    "Используй меню или выбери действие:",
    String(chatId),
    mainMenuKeyboard(),
  );
}

// ─── Callback handler ──────────────────────────────────────────────────────

export async function handleCallback(q: CallbackQuery): Promise<void> {
  const chatId = q.message?.chat.id;
  const msgId = q.message?.message_id;
  if (!chatId || !isAllowed(chatId)) {
    await answerCallback(q.id);
    return;
  }

  setChatId(String(chatId));
  await answerCallback(q.id);

  const data = q.data ?? "";

  // ── Noop — label buttons, do nothing ──
  if (data === "noop") return;

  // ── Quick actions from main menu ──
  if (data === "action:morning") {
    await startMorningFlow(chatId, msgId);
    return;
  }
  if (data === "action:decide") {
    sessions.set(chatId, { step: "decide", data: {} });
    await sendMessage(
      "🧠 *Анализ решения*\n\nОпиши решение, которое нужно проанализировать:",
      String(chatId),
    );
    return;
  }
  if (data === "action:status") {
    await sendStatusMessage(String(chatId));
    return;
  }
  if (data === "action:evening") {
    await sendMessage(
      "🌙 *Вечерний дайджест*\n\nХорошего отдыха! Завтра в 07:00 — утренний анализ.",
      String(chatId),
    );
    return;
  }

  // ── Morning flow: m:<step>:<value> ──
  if (data.startsWith("m:")) {
    await handleMorningCallback(chatId, msgId, data);
    return;
  }
}

// ─── Morning flow ──────────────────────────────────────────────────────────

async function startMorningFlow(chatId: number, editMsgId?: number): Promise<void> {
  const session: Session = { step: "energy", data: {} };
  sessions.set(chatId, session);

  const text = morningCard({}, "energy");
  const keyboard = stepKeyboard("energy");

  if (editMsgId) {
    await editMessage(String(chatId), editMsgId, text, keyboard);
    session.messageId = editMsgId;
  } else {
    const sent = await sendMessage(text, String(chatId), keyboard);
    if (sent) session.messageId = sent.message_id;
  }
  sessions.set(chatId, session);
}

async function handleMorningCallback(chatId: number, msgId: number | undefined, data: string): Promise<void> {
  const session = sessions.get(chatId);

  // cancel
  if (data === "m:cancel") {
    sessions.delete(chatId);
    if (msgId) {
      await editMessage(String(chatId), msgId, "❌ Отменено. Для нового анализа нажми /morning.", undefined);
    }
    return;
  }

  // confirm — run analysis
  if (data === "m:confirm") {
    if (!session) return;
    sessions.delete(chatId);

    const d = session.data;
    const confirmMsgId = session.messageId ?? msgId;

    if (confirmMsgId) {
      await editMessage(
        String(chatId),
        confirmMsgId,
        morningCard(d, "confirm").replace("✅ *Всё верно? Запустить анализ?*", "⏳ *Анализирую данные...*"),
        undefined,
      );
    }

    try {
      await runMorningSequence({
        energyLevel: d.energy,
        focusLevel: d.focus,
        moodLevel: d.mood,
        hadWorkout: d.workout,
        hadMassage: d.massage,
        hadAlcohol: d.alcohol,
      });
    } catch (err) {
      logger.error({ err }, "Morning sequence failed");
      await sendMessage("❌ Ошибка при формировании дайджеста. Попробуй ещё раз.", String(chatId));
    }
    return;
  }

  // parse step:value
  const parts = data.split(":");
  if (parts.length < 3) return;
  const [, step, value] = parts as [string, string, string];

  if (!session) return;
  const d = session.data;

  // update data
  if (step === "energy") d.energy = parseInt(value, 10);
  else if (step === "focus") d.focus = parseInt(value, 10);
  else if (step === "mood") d.mood = parseInt(value, 10);
  else if (step === "workout") d.workout = value;
  else if (step === "massage") d.massage = value;
  else if (step === "alcohol") d.alcohol = value;

  // advance to next step
  const nextStep = nextStepMap[step as keyof typeof nextStepMap] ?? "confirm";
  session.step = nextStep;
  sessions.set(chatId, session);

  const targetMsgId = session.messageId ?? msgId;
  const text = morningCard(d, nextStep);
  const keyboard = stepKeyboard(nextStep);

  if (targetMsgId) {
    await editMessage(String(chatId), targetMsgId, text, keyboard);
  } else {
    const sent = await sendMessage(text, String(chatId), keyboard);
    if (sent) session.messageId = sent.message_id;
  }
}

const nextStepMap = {
  energy:  "focus",
  focus:   "mood",
  mood:    "workout",
  workout: "massage",
  massage: "alcohol",
  alcohol: "confirm",
} as const;

// ─── Decide flow ───────────────────────────────────────────────────────────

async function runDecideFlow(chatId: number, description: string): Promise<void> {
  const thinkingMsg = await sendMessage(
    `🧠 *Анализирую решение...*\n\n_${escapeMarkdown(description)}_`,
    String(chatId),
  );

  try {
    const result = await runDecisionSupportAgent({
      mode: "decision_analysis",
      decisionDescription: description,
    });

    const da = result.decision_analysis;
    const lines = [
      "🧠 *Анализ решения*",
      "",
      `_${escapeMarkdown(description)}_`,
      "",
      `💡 *Рекомендация*`,
      da?.recommendation ?? result.summary,
    ];

    if (da?.risks?.length) {
      lines.push("", "⚠️ *Риски*");
      da.risks.forEach(r => lines.push(`• ${r}`));
    }
    if (da?.opportunities?.length) {
      lines.push("", "✅ *Возможности*");
      da.opportunities.forEach(o => lines.push(`• ${o}`));
    }
    if (da?.optimal_timing) lines.push("", `⏰ *Оптимальное время*: ${da.optimal_timing}`);
    if (da?.financial_lens) lines.push("", `💰 *Финансы*: ${da.financial_lens}`);
    if (da?.physical_lens)  lines.push("", `💪 *Физсостояние*: ${da.physical_lens}`);
    if (da?.reputation_lens) lines.push("", `🤝 *Репутация*: ${da.reputation_lens}`);
    lines.push("", "_Решение принимает Аня_ ✓");

    if (thinkingMsg) {
      await editMessage(String(chatId), thinkingMsg.message_id, lines.join("\n"));
    } else {
      await sendMessage(lines.join("\n"), String(chatId));
    }
  } catch (err) {
    logger.error({ err }, "Decision analysis failed");
    await sendMessage("❌ Ошибка анализа. Попробуй ещё раз.", String(chatId));
  }
}

// ─── Status ────────────────────────────────────────────────────────────────

async function sendStatusMessage(chatId: string): Promise<void> {
  await sendMessage(
    [
      "⚙️ *Статус LOS*",
      "",
      "🟢 Master Orchestrator",
      "🟢 Neuro & Bio Agent",
      "🟢 Decision Support Agent",
      "🟢 Telegram Bot (CoS)",
      "🔘 Health & Maintenance — Фаза 2",
      "🔘 Treasury Agent — Фаза 2",
      "🔘 Network Agent — Фаза 2",
      "🔘 Esoteric Agent — Фаза 3",
      "🔘 Communication Agent — Фаза 3",
      "",
      `🕐 ${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} MSK`,
    ].join("\n"),
    chatId,
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, c => `\\${c}`);
}

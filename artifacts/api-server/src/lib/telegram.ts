import TelegramBot, { type Message } from "node-telegram-bot-api";
import { logger } from "./logger";

let bot: TelegramBot | null = null;
let cosCharId: string | null = null;

export function getTelegramBot(): TelegramBot {
  if (!bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
    bot = new TelegramBot(token, { polling: false });
  }
  return bot;
}

export function getChatId(): string {
  const id = process.env.COS_TELEGRAM_CHAT_ID ?? cosCharId;
  if (!id) throw new Error("COS_TELEGRAM_CHAT_ID not set — Аня ещё не написала боту /start");
  return id;
}

export function setChatId(id: string) {
  cosCharId = id;
  logger.info({ chatId: id }, "CoS chat ID set");
}

export async function sendTelegramMessage(text: string, chatId?: string): Promise<void> {
  try {
    const bot = getTelegramBot();
    const id = chatId ?? getChatId();
    await bot.sendMessage(id, text, { parse_mode: "Markdown" });
  } catch (err) {
    logger.error({ err }, "Failed to send Telegram message");
  }
}

export async function sendMorningChecklist(chatId?: string): Promise<void> {
  const id = chatId ?? getChatId();
  const text = [
    "☀️ *Утренний чек-лист*",
    "",
    "Аня, пожалуйста, введи данные для утреннего анализа.",
    "",
    "Введи команду:",
    "`/morning <энергия 1-10> <фокус 1-10> <настроение 1-10> <тренировка д/н> <массаж д/н> <алкоголь д/н>`",
    "",
    "Пример: `/morning 7 8 7 н д н`",
    "",
    "или просто `/morning` — и я спрошу по очереди",
  ].join("\n");

  await sendTelegramMessage(text, id);
}

export async function sendEveningDigest(chatId?: string): Promise<void> {
  const id = chatId ?? getChatId();
  const today = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
  const text = [
    "🌙 *Вечерний дайджест LOS*",
    "",
    `📅 ${today}`,
    "",
    "Рабочий день завершён. Завтра в 07:00 получишь утренний анализ.",
    "",
    "Если хочешь проанализировать решение, напиши:",
    "`/decide <описание решения>`",
    "",
    "Хорошего отдыха! 🌙",
  ].join("\n");

  await sendTelegramMessage(text, id);
}

export function initTelegramPolling(
  onMessage: (msg: Message) => Promise<void>
): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return;
  }

  const pollingBot = new TelegramBot(token, { polling: true });
  bot = pollingBot;

  pollingBot.on("message", async (msg) => {
    logger.info({ chatId: msg.chat.id, text: msg.text }, "Telegram message received");
    try {
      await onMessage(msg);
    } catch (err) {
      logger.error({ err }, "Error handling Telegram message");
    }
  });

  pollingBot.on("polling_error", (err) => {
    logger.error({ err }, "Telegram polling error");
  });

  logger.info("Telegram bot polling started");
}

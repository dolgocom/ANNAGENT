import TelegramBot, { type Message } from "node-telegram-bot-api";
import { logger } from "./logger";

let bot: TelegramBot | null = null;
let cosCharId: string | null = null;
let messageHandler: ((msg: Message) => Promise<void>) | null = null;

export function getMessageHandler() {
  return messageHandler;
}

function createBot(): TelegramBot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
  // webhook mode — no polling
  return new TelegramBot(token, { polling: false });
}

export function getTelegramBot(): TelegramBot {
  if (!bot) bot = createBot();
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
    const b = getTelegramBot();
    const id = chatId ?? getChatId();
    await b.sendMessage(id, text, { parse_mode: "Markdown" });
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

export async function initTelegramWebhook(
  onMessage: (msg: Message) => Promise<void>
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return;
  }

  messageHandler = onMessage;

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!domain) {
    logger.error("REPLIT_DOMAINS not set — cannot register webhook");
    return;
  }

  const webhookUrl = `https://${domain}/api/telegram/webhook`;

  try {
    bot = new TelegramBot(token, { polling: false });
    await bot.setWebhook(webhookUrl);
    logger.info({ webhookUrl }, "Telegram webhook registered");
  } catch (err) {
    logger.error({ err }, "Failed to set Telegram webhook");
  }
}

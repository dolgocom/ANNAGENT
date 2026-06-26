import TelegramBot, { type Message, type CallbackQuery, type InlineKeyboardMarkup } from "node-telegram-bot-api";
import { logger } from "./logger";

let bot: TelegramBot | null = null;
let cosCharId: string | null = null;
let messageHandler: ((msg: Message) => Promise<void>) | null = null;
let callbackHandler: ((q: CallbackQuery) => Promise<void>) | null = null;

export function getMessageHandler() { return messageHandler; }
export function getCallbackHandler() { return callbackHandler; }

function createBot(): TelegramBot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
  return new TelegramBot(token, { polling: false });
}

export function getTelegramBot(): TelegramBot {
  if (!bot) bot = createBot();
  return bot;
}

export function getChatId(): string {
  const id = process.env.COS_TELEGRAM_CHAT_ID ?? cosCharId;
  if (!id) throw new Error("COS_TELEGRAM_CHAT_ID not set — напиши /start боту");
  return id;
}

export function setChatId(id: string) {
  cosCharId = id;
  logger.info({ chatId: id }, "CoS chat ID set");
}

// ─── Send helpers ──────────────────────────────────────────────────────────

export async function sendMessage(
  text: string,
  chatId?: string,
  keyboard?: InlineKeyboardMarkup,
): Promise<Message | null> {
  try {
    const b = getTelegramBot();
    const id = chatId ?? getChatId();
    return await b.sendMessage(id, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send Telegram message");
    return null;
  }
}

// Alias for backward compat
export const sendTelegramMessage = async (text: string, chatId?: string) => {
  await sendMessage(text, chatId);
};

export async function editMessage(
  chatId: string,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboardMarkup,
): Promise<void> {
  try {
    const b = getTelegramBot();
    await b.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (err) {
    logger.error({ err }, "Failed to edit Telegram message");
  }
}

export async function answerCallback(callbackQueryId: string, text?: string): Promise<void> {
  try {
    await getTelegramBot().answerCallbackQuery(callbackQueryId, { text });
  } catch (err) {
    logger.error({ err }, "Failed to answer callback query");
  }
}

// ─── Keyboard builders ─────────────────────────────────────────────────────

export function levelKeyboard(prefix: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [1, 2, 3, 4, 5].map(n => ({ text: String(n), callback_data: `${prefix}:${n}` })),
      [6, 7, 8, 9, 10].map(n => ({ text: String(n), callback_data: `${prefix}:${n}` })),
    ],
  };
}

export function yesNoKeyboard(prefix: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[
      { text: "✅  Да", callback_data: `${prefix}:yes` },
      { text: "❌  Нет", callback_data: `${prefix}:no` },
    ]],
  };
}

export function mainMenuKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "☀️ Утренний анализ", callback_data: "action:morning" },
        { text: "🌙 Вечерний дайджест", callback_data: "action:evening" },
      ],
      [
        { text: "🧠 Анализ решения", callback_data: "action:decide" },
        { text: "⚙️ Статус системы", callback_data: "action:status" },
      ],
    ],
  };
}

// ─── Scheduled senders ─────────────────────────────────────────────────────

export async function sendMorningChecklist(chatId?: string): Promise<void> {
  const text = [
    "☀️ *Утренний чек\\-лист*",
    "",
    "Аня, введи данные для утреннего анализа — нажми кнопку ниже\\.",
  ].join("\n");
  await sendMessage(
    "☀️ *Утренний чек-лист*\n\nАня, введи данные для утреннего анализа — нажми кнопку ниже.",
    chatId ?? getChatId(),
    {
      inline_keyboard: [[
        { text: "☀️ Начать утренний анализ", callback_data: "action:morning" },
      ]],
    }
  );
}

export async function sendEveningDigest(chatId?: string): Promise<void> {
  const today = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
  await sendMessage(
    [
      "🌙 *Вечерний дайджест LOS*",
      "",
      `📅 ${today}`,
      "",
      "Рабочий день завершён\\. Завтра в 07:00 буду ждать данных\\.",
      "",
      "Хорошего отдыха\\! 🌙",
    ].join("\n").replace(/\\/g, ""),
    chatId ?? getChatId(),
  );
}

// ─── Init ──────────────────────────────────────────────────────────────────

export async function initTelegramWebhook(
  onMessage: (msg: Message) => Promise<void>,
  onCallback: (q: CallbackQuery) => Promise<void>,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { logger.warn("TELEGRAM_BOT_TOKEN not set"); return; }

  messageHandler = onMessage;
  callbackHandler = onCallback;

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!domain) { logger.error("REPLIT_DOMAINS not set"); return; }

  const webhookUrl = `https://${domain}/api/telegram/webhook`;

  try {
    bot = new TelegramBot(token, { polling: false });

    // Register webhook
    await bot.setWebhook(webhookUrl);
    logger.info({ webhookUrl }, "Telegram webhook registered");

    // Set command menu visible in Telegram UI
    await bot.setMyCommands([
      { command: "morning", description: "☀️ Утренний анализ" },
      { command: "decide",  description: "🧠 Анализ решения" },
      { command: "status",  description: "⚙️ Статус системы" },
      { command: "help",    description: "📖 Справка" },
    ]);
    logger.info("Telegram bot commands menu set");
  } catch (err) {
    logger.error({ err }, "Failed to init Telegram webhook");
  }
}

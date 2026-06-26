import { Router, type IRouter } from "express";
import { getMessageHandler, getCallbackHandler } from "../lib/telegram";
import type { Message, CallbackQuery } from "node-telegram-bot-api";

const router: IRouter = Router();

router.post("/telegram/webhook", async (req, res) => {
  // Respond 200 immediately — Telegram requires fast acknowledgment
  res.sendStatus(200);

  const body = req.body as { message?: Message; callback_query?: CallbackQuery };

  if (body.message) {
    const handler = getMessageHandler();
    if (handler) {
      try { await handler(body.message); } catch (err) {
        req.log.error({ err }, "Telegram message handler error");
      }
    }
  } else if (body.callback_query) {
    const handler = getCallbackHandler();
    if (handler) {
      try { await handler(body.callback_query); } catch (err) {
        req.log.error({ err }, "Telegram callback handler error");
      }
    }
  }
});

export default router;

import { Router, type IRouter } from "express";
import { getMessageHandler } from "../lib/telegram";
import type { Message } from "node-telegram-bot-api";

const router: IRouter = Router();

router.post("/telegram/webhook", async (req, res) => {
  // Always respond 200 immediately so Telegram doesn't retry
  res.sendStatus(200);

  const body = req.body as { message?: Message };
  const msg = body.message;
  if (!msg) return;

  const handler = getMessageHandler();
  if (!handler) return;

  try {
    await handler(msg);
  } catch (err) {
    req.log.error({ err }, "Telegram webhook handler error");
  }
});

export default router;

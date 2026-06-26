import asyncio
import asyncpg
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties

from los.config import TELEGRAM_BOT_TOKEN, DATABASE_URL
from los.database.models import SCHEMA_SQL
from los.database.crud import fetch_one
from los.bot.handlers import router
from los.scheduler.jobs import init_scheduler


async def init_db():
    print("[DB] Инициализация схемы...")
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute(SCHEMA_SQL)
        print("[DB] Схема готова.")
    except Exception as e:
        print(f"[DB] Ошибка: {e}")
    finally:
        await conn.close()


async def main():
    print("[LOS] Запуск системы LOS...")

    await init_db()

    bot = Bot(
        token=TELEGRAM_BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN)
    )
    dp = Dispatcher()
    dp.include_router(router)

    me = await bot.get_me()
    print(f"[Bot] Запущен как @{me.username}")

    await bot.delete_webhook(drop_pending_updates=True)
    print("[Bot] Webhook удалён, polling режим активен.")

    row = await fetch_one("SELECT value FROM system_settings WHERE key = 'owner_chat_id'")
    chat_id = int(row["value"]) if row and row["value"] else None

    scheduler = init_scheduler(bot, chat_id)
    scheduler.start()

    if chat_id:
        print(f"[Scheduler] Запущен. Автобрифинги для chat_id: {chat_id}")
    else:
        print("[Scheduler] owner_chat_id не задан. Отправь /start боту — зарегистрирую.")

    print("[LOS] Polling начат. Ожидаю сообщения...")
    await dp.start_polling(bot, allowed_updates=["message", "callback_query"])


if __name__ == "__main__":
    asyncio.run(main())

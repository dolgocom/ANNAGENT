import asyncio
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz
from los.config import TIMEZONE, MORNING_BRIEFING_HOUR, MORNING_BRIEFING_MINUTE
from los.config import EVENING_DIGEST_HOUR, EVENING_DIGEST_MINUTE, REMINDER_PING_MINUTES
from los.orchestrator import master
from los.database import crud

_bot = None
_chat_id = None


def init_scheduler(bot, chat_id: int) -> AsyncIOScheduler:
    global _bot, _chat_id
    _bot = bot
    _chat_id = chat_id

    tz = pytz.timezone(TIMEZONE)
    scheduler = AsyncIOScheduler(timezone=tz)

    scheduler.add_job(
        _send_morning_briefing,
        CronTrigger(hour=MORNING_BRIEFING_HOUR, minute=MORNING_BRIEFING_MINUTE, timezone=tz),
        id="morning_briefing",
        replace_existing=True
    )

    scheduler.add_job(
        _send_evening_digest,
        CronTrigger(hour=EVENING_DIGEST_HOUR, minute=EVENING_DIGEST_MINUTE, timezone=tz),
        id="evening_digest",
        replace_existing=True
    )

    scheduler.add_job(
        _check_subjective_ping,
        CronTrigger(minute=f"*/{REMINDER_PING_MINUTES}", timezone=tz),
        id="subjective_ping",
        replace_existing=True
    )

    return scheduler


async def _send_morning_briefing():
    if not _bot or not _chat_id:
        return
    try:
        briefing = await master.run_morning_briefing()
        await _bot.send_message(_chat_id, briefing, parse_mode="Markdown")
        await crud.set_setting("awaiting_subjective_input", "true")
        await crud.set_setting("ping_count", "0")
        print(f"[Scheduler] Утренний брифинг отправлен в {datetime.now()}")
    except Exception as e:
        print(f"[Scheduler] Ошибка утреннего брифинга: {e}")


async def _send_evening_digest():
    if not _bot or not _chat_id:
        return
    try:
        digest = await master.run_evening_digest()
        await _bot.send_message(_chat_id, digest, parse_mode="Markdown")
        print(f"[Scheduler] Вечерний дайджест отправлен в {datetime.now()}")
    except Exception as e:
        print(f"[Scheduler] Ошибка вечернего дайджеста: {e}")


async def _check_subjective_ping():
    if not _bot or not _chat_id:
        return
    try:
        awaiting = await crud.get_setting("awaiting_subjective_input")
        if awaiting != "true":
            return

        ping_count_str = await crud.get_setting("ping_count") or "0"
        ping_count = int(ping_count_str)

        from los.config import MAX_PINGS
        if ping_count >= MAX_PINGS:
            await crud.set_setting("awaiting_subjective_input", "false")
            return

        await _bot.send_message(
            _chat_id,
            "📝 Введи своё состояние:\n*Энергия / Фокус / Настроение / Тренировка / Массаж / Алкоголь*\n\nПример: _Энергия 7, фокус 8, настроение 6, тренировка да, массаж нет, алкоголь нет_",
            parse_mode="Markdown"
        )
        await crud.set_setting("ping_count", str(ping_count + 1))
    except Exception as e:
        print(f"[Scheduler] Ошибка пинга: {e}")

import asyncio
from aiogram import Router, F
from aiogram.types import Message, Voice
from aiogram.filters import CommandStart, Command
from aiogram.fsm.context import FSMContext
from los.orchestrator import master
from los.database import crud
from los.bot.voice import transcribe_voice

router = Router()

HELP_TEXT = """
🤖 *LOS — Life Operating System*

Я — Аня, твой Chief of Staff.

*Команды:*
/start — приветствие
/status — текущее состояние (Oura + субъективное)
/briefing — утренний брифинг прямо сейчас
/digest — вечерний дайджест прямо сейчас
/remember — сохранить факт в память
/help — эта справка

*Как ввести состояние:*
Напиши в любом формате, например:
_Энергия 7, фокус 8, настроение 6, тренировка да, массаж нет, алкоголь нет_

*Любой вопрос или задача — просто напиши.*
"""


@router.message(CommandStart())
async def cmd_start(message: Message):
    chat_id = message.chat.id
    await crud.execute(
        "INSERT INTO system_settings (key, value, updated_at) VALUES ('owner_chat_id', $1, NOW()) "
        "ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
        str(chat_id)
    )

    from los.scheduler.jobs import init_scheduler, _bot, _chat_id
    import los.scheduler.jobs as sched_module
    if sched_module._chat_id != chat_id:
        sched_module._chat_id = chat_id
        sched_module._bot = message.bot

    await message.answer(
        "👋 Привет. Я — Аня, Chief of Staff системы LOS.\n\n"
        "Работаю как твой цифровой штаб: слежу за состоянием, помогаю с расписанием и решениями.\n\n"
        f"✅ Chat ID зарегистрирован: `{chat_id}`\n"
        "Теперь буду присылать брифинги автоматически в 07:00 и 22:00 МСК.\n\n"
        "Напиши /help чтобы увидеть все команды.",
        parse_mode="Markdown"
    )


@router.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(HELP_TEXT, parse_mode="Markdown")


@router.message(Command("status"))
async def cmd_status(message: Message):
    await message.answer("⏳ Получаю данные Oura Ring...")
    try:
        health_data = await master._build_health_context()
        summary = master._format_health_summary(health_data)
        await message.answer(f"📊 *Текущее состояние:*\n\n{summary}", parse_mode="Markdown")
    except Exception as e:
        await message.answer(f"❌ Ошибка при получении данных: {e}")


@router.message(Command("briefing"))
async def cmd_briefing(message: Message):
    await message.answer("⏳ Формирую утренний брифинг...")
    try:
        briefing = await master.run_morning_briefing()
        await message.answer(briefing, parse_mode="Markdown")
        await crud.set_setting("awaiting_subjective_input", "true")
        await crud.set_setting("ping_count", "0")
    except Exception as e:
        await message.answer(f"❌ Ошибка при формировании брифинга: {e}")


@router.message(Command("digest"))
async def cmd_digest(message: Message):
    await message.answer("⏳ Формирую вечерний дайджест...")
    try:
        digest = await master.run_evening_digest()
        await message.answer(digest, parse_mode="Markdown")
    except Exception as e:
        await message.answer(f"❌ Ошибка: {e}")


@router.message(Command("remember"))
async def cmd_remember(message: Message):
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        await message.answer("Напиши что запомнить. Например:\n/remember Иван Петров предпочитает встречи до 11 утра")
        return
    from los.memory import mem_client
    await mem_client.remember(args[1], category="fact")
    await message.answer(f"✅ Запомнила: {args[1]}")


@router.message(F.voice)
async def handle_voice(message: Message):
    await message.answer("🎙 Транскрибирую...")
    try:
        text = await transcribe_voice(message)
        if text:
            await message.answer(f"📝 _{text}_", parse_mode="Markdown")
            reply = await _process_text(text, message)
            await message.answer(reply, parse_mode="Markdown")
        else:
            await message.answer("❌ Не удалось транскрибировать голосовое сообщение.")
    except Exception as e:
        await message.answer(f"❌ Ошибка транскрипции: {e}")


@router.message(F.text)
async def handle_text(message: Message):
    text = message.text.strip()

    awaiting = await crud.get_setting("awaiting_subjective_input")
    if awaiting == "true":
        subjective_result = await master.handle_subjective_input(text)
        if subjective_result:
            await message.answer(subjective_result, parse_mode="Markdown")
            return

    await message.answer("⏳ Думаю...")
    try:
        reply = await _process_text(text, message)
        await message.answer(reply, parse_mode="Markdown")
    except Exception as e:
        await message.answer(f"❌ Ошибка: {e}")


async def _process_text(text: str, message: Message) -> str:
    return await master.handle_message(text)

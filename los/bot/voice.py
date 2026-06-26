import os
import tempfile
import httpx
from aiogram.types import Message
from openai import AsyncOpenAI
from los.config import OPENAI_API_KEY, WHISPER_MODEL

client = AsyncOpenAI(api_key=OPENAI_API_KEY)


async def transcribe_voice(message: Message) -> str:
    voice: Voice = message.voice
    file_info = await message.bot.get_file(voice.file_id)
    file_url = f"https://api.telegram.org/file/bot{message.bot.token}/{file_info.file_path}"

    async with httpx.AsyncClient() as http_client:
        response = await http_client.get(file_url)
        response.raise_for_status()
        audio_data = response.content

    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
        tmp.write(audio_data)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as f:
            transcript = await client.audio.transcriptions.create(
                model=WHISPER_MODEL,
                file=f,
                language="ru"
            )
        return transcript.text
    finally:
        os.unlink(tmp_path)

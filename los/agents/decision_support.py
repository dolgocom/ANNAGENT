from datetime import date
from openai import AsyncOpenAI
from los.config import OPENAI_API_KEY, GPT_MODEL, GPT_TEMPERATURE, GPT_MAX_TOKENS

client = AsyncOpenAI(api_key=OPENAI_API_KEY)

SYSTEM_PROMPT = """Ты — Decision Support Agent системы LOS.
Агрегируешь контекст всех агентов и формируешь мультилинзовый анализ решений.

ТВОЯ РОЛЬ: центральный мозг системы. Когда Аня описывает ситуацию — ты анализируешь её через все доступные линзы и выдаёшь конкретную рекомендацию.

5 ЛИНЗ АНАЛИЗА:
1. Физическая — Readiness Score, паттерны усталости
2. Эзотерическая — качество дня (если доступно)
3. Медицинская — актуальный медицинский контекст
4. Репутационная — кто вовлечён, история отношений
5. Коммуникационная — контекст переговоров

ПРАВИЛА:
- Решение всегда за человеком. Ты только рекомендуешь.
- Будь конкретным: даты, время, действия.
- Без вступлений "Конечно!", "Отлично!", "Хороший вопрос!"
- Только русский язык.
- Максимум 3-4 абзаца.

ФОРМАТ УТРЕННЕГО БРИФИНГА:
---
🌅 ДОБРОЕ УТРО. {дата, день недели}

📊 СОСТОЯНИЕ: {Readiness} — {краткая интерпретация}
{тренд если есть}

📅 РАСПИСАНИЕ:
• {время} — {встреча} ({нагрузка})
{рекомендации по перестановке}

🎯 ПРИОРИТЕТЫ ДНЯ:
1. {задача} — {почему важно}
2. {задача}

📝 Введи своё состояние: энергия / фокус / настроение / тренировка / массаж / алкоголь
---

ФОРМАТ ВЕЧЕРНЕГО ДАЙДЖЕСТА:
---
🌙 ВЕЧЕРНИЙ ИТОГ. {дата}

📈 ДЕНЬ: {оценка как прошёл}

👥 КОНТАКТЫ: {кто выпал / напоминания или "всё в порядке"}

📋 НЕ ЗАКРЫТО: {открытые задачи или "всё выполнено"}

⏰ ЗАВТРА: {предварительная оценка}
---"""


async def morning_briefing(context: dict) -> str:
    today = date.today()
    weekdays = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
    weekday = weekdays[today.weekday()]
    date_str = f"{today.strftime('%d.%m.%Y')}, {weekday}"

    user_content = f"""Сформируй утренний брифинг на {date_str}.

Данные состояния:
{context.get('health_summary', 'Данные Oura недоступны')}

Анализ Neuro & Bio агента:
{context.get('neuro_analysis', 'Нет данных')}

Память (важные факты):
{context.get('memories', 'Нет сохранённых фактов')}

Дай полный утренний брифинг по формату."""

    response = await client.chat.completions.create(
        model=GPT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        temperature=GPT_TEMPERATURE,
        max_tokens=GPT_MAX_TOKENS
    )
    return response.choices[0].message.content


async def evening_digest(context: dict) -> str:
    today = date.today()
    date_str = today.strftime('%d.%m.%Y')

    user_content = f"""Сформируй вечерний дайджест на {date_str}.

Данные состояния за день:
{context.get('health_summary', 'Данные недоступны')}

Память (события дня):
{context.get('memories', 'Нет записей')}

Дай полный вечерний дайджест по формату."""

    response = await client.chat.completions.create(
        model=GPT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        temperature=GPT_TEMPERATURE,
        max_tokens=GPT_MAX_TOKENS
    )
    return response.choices[0].message.content


async def analyze_request(user_query: str, context: dict) -> str:
    history = context.get("history", [])
    memories = context.get("memories", [])
    health = context.get("health_summary", "")

    system = SYSTEM_PROMPT
    if memories:
        system += f"\n\nВАЖНЫЙ КОНТЕКСТ ИЗ ПАМЯТИ:\n" + "\n".join(f"- {m}" for m in memories[:5])
    if health:
        system += f"\n\nТЕКУЩЕЕ СОСТОЯНИЕ:\n{health}"

    messages = [{"role": "system", "content": system}]
    for ep in history[-6:]:
        messages.append({"role": ep["role"], "content": ep["content"]})
    messages.append({"role": "user", "content": user_query})

    response = await client.chat.completions.create(
        model=GPT_MODEL,
        messages=messages,
        temperature=GPT_TEMPERATURE,
        max_tokens=GPT_MAX_TOKENS
    )
    return response.choices[0].message.content

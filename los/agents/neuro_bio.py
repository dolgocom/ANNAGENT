from openai import AsyncOpenAI
from los.config import OPENAI_API_KEY, GPT_MODEL, GPT_TEMPERATURE, GPT_MAX_TOKENS

client = AsyncOpenAI(api_key=OPENAI_API_KEY)

SYSTEM_PROMPT = """Ты — Neuro & Bio Intelligence Agent системы LOS.
Анализируешь физическое и ментальное состояние босса и оптимизируешь его расписание.

ДАННЫЕ ДЛЯ АНАЛИЗА (получаешь от оркестратора):
- readiness_score: число 0-100 из Oura Ring (чем выше — тем лучше)
- hrv: вариабельность сердечного ритма
- sleep_score: качество сна 0-100
- sleep_hours: часы сна
- energy, focus, mood: субъективная оценка 1-10 (приоритет над Oura при конфликте)
- workout_done, massage_done, alcohol: булевы флаги
- meetings_today: список встреч с типами и временем
- trend_7d: динамика readiness за 7 дней

ПРАВИЛА АНАЛИЗА:
- Readiness < 65: флаг low_readiness, предложи перенести тяжёлые встречи
- Readiness < 50: критический флаг, настаивай на перестановке расписания
- Снижение 3+ дня подряд: флаг fatigue_pattern, предупреди о накоплении усталости
- При конфликте субъективного и Oura: используй субъективное, отметь расхождение

ТИПЫ ВСТРЕЧ:
- strategic / negotiations / public_speaking / travel → нагрузка: ВЫСОКАЯ
- team_operational / one_on_one → нагрузка: СРЕДНЯЯ
- administrative / routine → нагрузка: НИЗКАЯ
- sport / rest → ЗАЩИЩЁН (не трогать)
- family → НЕПРИКОСНОВЕННО (игнорировать)

Отвечай кратко, конкретно. Только русский язык. Без вступлений типа "Конечно!"."""


async def analyze(health_data: dict, context: str = "") -> str:
    user_content = f"""Данные на сегодня:
{_format_health(health_data)}

{f"Дополнительный контекст: {context}" if context else ""}

Дай краткий анализ состояния и рекомендации по расписанию."""

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


def _format_health(data: dict) -> str:
    lines = []
    if data.get("readiness_score") is not None:
        lines.append(f"Readiness Score: {data['readiness_score']}/100")
    if data.get("sleep_score") is not None:
        lines.append(f"Качество сна: {data['sleep_score']}/100")
    if data.get("sleep_hours") is not None:
        lines.append(f"Часов сна: {data['sleep_hours']:.1f}")
    if data.get("hrv_avg") is not None:
        lines.append(f"HRV: {data['hrv_avg']:.0f}")
    if data.get("heart_rate_avg") is not None:
        lines.append(f"ЧСС среднее: {data['heart_rate_avg']:.0f}")
    if data.get("energy_subjective") is not None:
        lines.append(f"Энергия (субъективно): {data['energy_subjective']}/10")
    if data.get("focus_subjective") is not None:
        lines.append(f"Фокус (субъективно): {data['focus_subjective']}/10")
    if data.get("mood_subjective") is not None:
        lines.append(f"Настроение (субъективно): {data['mood_subjective']}/10")
    flags = []
    if data.get("workout_done"): flags.append("тренировка ✓")
    if data.get("massage_done"): flags.append("массаж ✓")
    if data.get("alcohol"): flags.append("алкоголь ⚠️")
    if flags:
        lines.append(f"Активности: {', '.join(flags)}")
    if data.get("trend_7d"):
        trend = data["trend_7d"]
        lines.append(f"Тренд 7 дней: {trend}")
    return "\n".join(lines) if lines else "Данные недоступны"


def get_readiness_flags(readiness: int, trend: list) -> list:
    flags = []
    if readiness is not None:
        if readiness < 50:
            flags.append("⛔ КРИТИЧЕСКОЕ истощение")
        elif readiness < 65:
            flags.append("⚠️ Низкий Readiness")
    if trend and len(trend) >= 3:
        last3 = trend[:3]
        if all(last3[i] < last3[i+1] for i in range(len(last3)-1) if last3[i] is not None and last3[i+1] is not None):
            flags.append("📉 Паттерн усталости (3+ дня снижения)")
    return flags

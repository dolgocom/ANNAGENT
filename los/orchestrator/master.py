from datetime import date
from los.database import crud
from los.integrations import oura
from los.memory import mem_client
from los.agents import neuro_bio, decision_support


async def _build_health_context() -> dict:
    today_health = await crud.get_today_health()
    oura_data = await oura.fetch_all_today()
    trend_rows = await crud.get_health_trend(7)

    health_data = {}

    if oura_data.get("readiness"):
        r = oura_data["readiness"]
        health_data["readiness_score"] = r.get("score")
        contributors = r.get("contributors", {})
        health_data["hrv_avg"] = contributors.get("hrv_balance")
    if oura_data.get("sleep"):
        s = oura_data["sleep"]
        health_data["sleep_score"] = s.get("score")
        health_data["sleep_hours"] = round(s.get("contributors", {}).get("total_sleep", 0) / 3600, 1) if s.get("contributors", {}).get("total_sleep") else None
    if oura_data.get("heartrate_avg"):
        health_data["heart_rate_avg"] = oura_data["heartrate_avg"]

    if today_health:
        for field in ["energy_subjective", "focus_subjective", "mood_subjective",
                      "workout_done", "massage_done", "alcohol"]:
            if today_health.get(field) is not None:
                health_data[field] = today_health[field]
        if today_health.get("readiness_score") and not health_data.get("readiness_score"):
            health_data["readiness_score"] = today_health["readiness_score"]

    if health_data:
        await crud.upsert_today_health({k: v for k, v in health_data.items() if v is not None})

    trend_7d = [r.get("readiness_score") for r in trend_rows if r.get("readiness_score")]
    health_data["trend_7d"] = f"{', '.join(str(x) for x in trend_7d)}" if trend_7d else None

    return health_data


def _format_health_summary(health_data: dict) -> str:
    lines = []
    if health_data.get("readiness_score") is not None:
        rs = health_data["readiness_score"]
        emoji = "🟢" if rs >= 75 else "🟡" if rs >= 65 else "🔴"
        lines.append(f"{emoji} Readiness Score: {rs}/100")
    if health_data.get("sleep_score") is not None:
        lines.append(f"😴 Сон: {health_data['sleep_score']}/100")
    if health_data.get("sleep_hours") is not None:
        lines.append(f"⏱ Часов сна: {health_data['sleep_hours']:.1f}")
    if health_data.get("energy_subjective") is not None:
        lines.append(f"⚡ Энергия: {health_data['energy_subjective']}/10")
    if health_data.get("focus_subjective") is not None:
        lines.append(f"🎯 Фокус: {health_data['focus_subjective']}/10")
    if health_data.get("mood_subjective") is not None:
        lines.append(f"😊 Настроение: {health_data['mood_subjective']}/10")
    return "\n".join(lines) if lines else "Данные состояния недоступны (введи вручную)"


async def run_morning_briefing() -> str:
    health_data = await _build_health_context()
    health_summary = _format_health_summary(health_data)

    neuro_analysis = await neuro_bio.analyze(health_data)

    memories = await mem_client.recall(limit=5)
    memories_text = "\n".join(f"- {m}" for m in memories) if memories else "Нет"

    context = {
        "health_summary": health_summary,
        "neuro_analysis": neuro_analysis,
        "memories": memories_text,
    }

    briefing = await decision_support.morning_briefing(context)

    await mem_client.add_episode("assistant", briefing, agent="decision_support")
    return briefing


async def run_evening_digest() -> str:
    health_data = await _build_health_context()
    health_summary = _format_health_summary(health_data)

    memories = await mem_client.recall(limit=5)
    memories_text = "\n".join(f"- {m}" for m in memories) if memories else "Нет"

    context = {
        "health_summary": health_summary,
        "memories": memories_text,
    }

    digest = await decision_support.evening_digest(context)
    await mem_client.add_episode("assistant", digest, agent="decision_support")
    return digest


async def handle_message(user_text: str) -> str:
    await mem_client.add_episode("user", user_text)

    health_data = await _build_health_context()
    health_summary = _format_health_summary(health_data)
    memories = await mem_client.recall(limit=5)
    history = await mem_client.get_history(limit=10)

    lower = user_text.lower()

    if any(kw in lower for kw in ["запомни", "запомнить", "сохрани", "запиши"]):
        await mem_client.remember(user_text, category="fact")
        reply = "✅ Запомнила."
        await mem_client.add_episode("assistant", reply)
        return reply

    context = {
        "health_summary": health_summary,
        "memories": memories,
        "history": history,
    }

    reply = await decision_support.analyze_request(user_text, context)
    await mem_client.add_episode("assistant", reply, agent="decision_support")
    return reply


async def handle_subjective_input(text: str) -> str:
    data = _parse_subjective(text)
    if data:
        await crud.upsert_today_health(data)
        await crud.set_setting("awaiting_subjective_input", "false")
        await crud.set_setting("ping_count", "0")

        lines = []
        if data.get("energy_subjective"): lines.append(f"⚡ Энергия: {data['energy_subjective']}/10")
        if data.get("focus_subjective"): lines.append(f"🎯 Фокус: {data['focus_subjective']}/10")
        if data.get("mood_subjective"): lines.append(f"😊 Настроение: {data['mood_subjective']}/10")
        if data.get("workout_done") is not None: lines.append(f"🏋️ Тренировка: {'да' if data['workout_done'] else 'нет'}")
        if data.get("massage_done") is not None: lines.append(f"💆 Массаж: {'да' if data['massage_done'] else 'нет'}")
        if data.get("alcohol") is not None: lines.append(f"🍷 Алкоголь: {'да' if data['alcohol'] else 'нет'}")

        reply = "✅ Принято!\n" + "\n".join(lines)
        return reply
    return None


def _parse_subjective(text: str) -> dict:
    import re
    data = {}
    t = text.lower()

    m = re.search(r'энерги[яю]\s*[:\-]?\s*(\d+)', t)
    if m: data["energy_subjective"] = int(m.group(1))

    m = re.search(r'фокус\s*[:\-]?\s*(\d+)', t)
    if m: data["focus_subjective"] = int(m.group(1))

    m = re.search(r'настроени[ея]\s*[:\-]?\s*(\d+)', t)
    if m: data["mood_subjective"] = int(m.group(1))

    if re.search(r'тренировк[аи]\s*[:\-]?\s*(да|yes|✓|есть|был)', t):
        data["workout_done"] = True
    elif re.search(r'тренировк[аи]\s*[:\-]?\s*(нет|no|не\s+был)', t):
        data["workout_done"] = False

    if re.search(r'массаж\s*[:\-]?\s*(да|yes|✓|есть|был)', t):
        data["massage_done"] = True
    elif re.search(r'массаж\s*[:\-]?\s*(нет|no|не\s+был)', t):
        data["massage_done"] = False

    if re.search(r'алкоголь\s*[:\-]?\s*(да|yes|✓|есть|пил)', t):
        data["alcohol"] = True
    elif re.search(r'алкоголь\s*[:\-]?\s*(нет|no|не\s+пил)', t):
        data["alcohol"] = False

    return data

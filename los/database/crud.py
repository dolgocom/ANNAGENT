import asyncpg
import json
from datetime import date, datetime
from typing import Optional
from los.config import DATABASE_URL


async def get_pool():
    return await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)


_pool = None


async def pool():
    global _pool
    if _pool is None:
        _pool = await get_pool()
    return _pool


async def fetch_one(query: str, *args):
    p = await pool()
    async with p.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def fetch_all(query: str, *args):
    p = await pool()
    async with p.acquire() as conn:
        return await conn.fetch(query, *args)


async def execute(query: str, *args):
    p = await pool()
    async with p.acquire() as conn:
        return await conn.execute(query, *args)


async def get_setting(key: str) -> Optional[str]:
    row = await fetch_one("SELECT value FROM system_settings WHERE key = $1", key)
    return row["value"] if row else None


async def set_setting(key: str, value: str):
    await execute(
        "INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW()) "
        "ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
        key, value
    )


async def get_today_health(today: date = None) -> Optional[dict]:
    if today is None:
        today = date.today()
    row = await fetch_one("SELECT * FROM daily_health WHERE date = $1", today)
    return dict(row) if row else None


async def upsert_today_health(data: dict, today: date = None):
    if today is None:
        today = date.today()
    existing = await get_today_health(today)
    if existing:
        sets = []
        vals = []
        i = 2
        for k, v in data.items():
            sets.append(f"{k} = ${i}")
            vals.append(v)
            i += 1
        sets.append("updated_at = NOW()")
        await execute(
            f"UPDATE daily_health SET {', '.join(sets)} WHERE date = $1",
            today, *vals
        )
    else:
        cols = ["date"] + list(data.keys())
        placeholders = [f"${i+1}" for i in range(len(cols))]
        await execute(
            f"INSERT INTO daily_health ({', '.join(cols)}) VALUES ({', '.join(placeholders)})",
            today, *data.values()
        )


async def get_health_trend(days: int = 7) -> list:
    rows = await fetch_all(
        "SELECT * FROM daily_health ORDER BY date DESC LIMIT $1", days
    )
    return [dict(r) for r in rows]


async def save_episode(role: str, content: str, agent: str = None):
    await execute(
        "INSERT INTO conversation_episodes (role, content, agent_involved) VALUES ($1, $2, $3)",
        role, content, agent
    )


async def get_recent_episodes(limit: int = 20) -> list:
    rows = await fetch_all(
        "SELECT role, content, agent_involved, created_at FROM conversation_episodes "
        "ORDER BY created_at DESC LIMIT $1", limit
    )
    return [dict(r) for r in reversed(rows)]


async def save_memory(content: str, category: str = "general", source: str = "user"):
    await execute(
        "INSERT INTO semantic_memories (content, category, source) VALUES ($1, $2, $3)",
        content, category, source
    )


async def search_memories(limit: int = 10) -> list:
    rows = await fetch_all(
        "SELECT content, category, created_at FROM semantic_memories ORDER BY created_at DESC LIMIT $1",
        limit
    )
    return [dict(r) for r in rows]


async def get_contacts_with_upcoming_birthdays(days_ahead: int = 7) -> list:
    rows = await fetch_all(
        """
        SELECT *, 
               (DATE_PART('doy', birth_date::date) - DATE_PART('doy', CURRENT_DATE)) AS days_until
        FROM contacts
        WHERE birth_date IS NOT NULL
          AND (
              DATE_PART('doy', birth_date::date) - DATE_PART('doy', CURRENT_DATE)
          ) BETWEEN 0 AND $1
        ORDER BY days_until
        """,
        days_ahead
    )
    return [dict(r) for r in rows]

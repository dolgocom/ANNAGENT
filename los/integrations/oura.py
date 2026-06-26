import httpx
from datetime import date, timedelta
from typing import Optional
from los.config import OURA_BASE_URL, OURA_ACCESS_TOKEN


def _headers():
    return {"Authorization": f"Bearer {OURA_ACCESS_TOKEN}"}


async def get_readiness(for_date: date = None) -> Optional[dict]:
    if not OURA_ACCESS_TOKEN:
        return None
    if for_date is None:
        for_date = date.today()
    ds = for_date.strftime("%Y-%m-%d")
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(
                f"{OURA_BASE_URL}/usercollection/daily_readiness",
                params={"start_date": ds, "end_date": ds},
                headers=_headers()
            )
            r.raise_for_status()
            data = r.json()
            items = data.get("data", [])
            return items[0] if items else None
        except Exception as e:
            print(f"[Oura] readiness error: {e}")
            return None


async def get_sleep(for_date: date = None) -> Optional[dict]:
    if not OURA_ACCESS_TOKEN:
        return None
    if for_date is None:
        for_date = date.today()
    ds = for_date.strftime("%Y-%m-%d")
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(
                f"{OURA_BASE_URL}/usercollection/daily_sleep",
                params={"start_date": ds, "end_date": ds},
                headers=_headers()
            )
            r.raise_for_status()
            data = r.json()
            items = data.get("data", [])
            return items[0] if items else None
        except Exception as e:
            print(f"[Oura] sleep error: {e}")
            return None


async def get_heartrate(for_date: date = None) -> Optional[float]:
    if not OURA_ACCESS_TOKEN:
        return None
    if for_date is None:
        for_date = date.today()
    ds = for_date.strftime("%Y-%m-%d")
    next_ds = (for_date + timedelta(days=1)).strftime("%Y-%m-%d")
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(
                f"{OURA_BASE_URL}/usercollection/heartrate",
                params={"start_datetime": f"{ds}T00:00:00+03:00", "end_datetime": f"{next_ds}T00:00:00+03:00"},
                headers=_headers()
            )
            r.raise_for_status()
            items = r.json().get("data", [])
            if items:
                bpms = [i["bpm"] for i in items if "bpm" in i]
                return round(sum(bpms) / len(bpms), 1) if bpms else None
            return None
        except Exception as e:
            print(f"[Oura] heartrate error: {e}")
            return None


async def fetch_all_today() -> dict:
    from asyncio import gather
    readiness, sleep, hr = await gather(
        get_readiness(),
        get_sleep(),
        get_heartrate()
    )
    return {
        "readiness": readiness,
        "sleep": sleep,
        "heartrate_avg": hr
    }

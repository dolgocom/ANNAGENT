from los.database.crud import save_memory, search_memories, save_episode, get_recent_episodes

USER_ID = "boss"


async def remember(content: str, category: str = "general"):
    await save_memory(content, category=category, source="conversation")


async def recall(query: str = None, limit: int = 10) -> list:
    memories = await search_memories(limit=limit)
    return [m["content"] for m in memories]


async def add_episode(role: str, content: str, agent: str = None):
    await save_episode(role, content, agent)


async def get_history(limit: int = 20) -> list:
    episodes = await get_recent_episodes(limit)
    return [{"role": e["role"], "content": e["content"]} for e in episodes]

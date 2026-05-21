import json
import logging
from dataclasses import dataclass, field

from src.config import settings
from src.services.llm import LLMService
from src.services.router import ModelRouter
from src.services.cache import ResponseCache
from src.models.schemas import CompletionRequest

logger = logging.getLogger(__name__)

CONSOLIDATION_PROMPT = """You are a memory consolidation system. Analyze the following list of memories and:

1. **Identify duplicates**: Find memories that describe the same fact or entity and merge them.
2. **Merge similar**: Combine memories that are closely related into a single, more comprehensive memory.
3. **Archive outdated**: Flag memories that appear outdated, superseded, or contradicted by newer ones.

For each action, explain your reasoning.

Return a JSON object with three keys:
- "merged": A list of merged memory objects. Each has: "key", "value", "type", "importance", "confidence", "source_ids" (list of original memory IDs that were merged)
- "archived": A list of memory ID strings that should be archived (outdated/superseded)
- "unchanged": A list of memory ID strings that need no changes

Example output:
{
  "merged": [
    {"key": "user_location", "value": "User lives in Seoul, South Korea (moved from Busan)", "type": "entity", "importance": 0.8, "confidence": 0.9, "source_ids": ["id1", "id2"]}
  ],
  "archived": ["id3"],
  "unchanged": ["id4", "id5"]
}

Memories to consolidate:
"""


@dataclass
class ConsolidationResult:
    """Result of memory consolidation."""

    merged: list[dict] = field(default_factory=list)
    archived: list[str] = field(default_factory=list)
    unchanged: list[str] = field(default_factory=list)


class MemoryConsolidationService:
    """Consolidates memories by merging duplicates and archiving outdated ones using LLM."""

    def __init__(self) -> None:
        model_router = ModelRouter()
        cache = ResponseCache(redis_client=None, default_ttl=0)
        self._llm = LLMService(router=model_router, cache=cache)

    async def consolidate(self, memories: list[dict]) -> ConsolidationResult:
        """Use LLM to identify duplicates, merge similar memories, suggest archival of outdated ones.

        Args:
            memories: List of memory dicts with keys: id, type, key, value, importance, confidence.

        Returns:
            ConsolidationResult with merged, archived, and unchanged lists.
        """
        if not memories:
            return ConsolidationResult()

        if len(memories) == 1:
            mem_id = memories[0].get("id", "")
            return ConsolidationResult(unchanged=[mem_id] if mem_id else [])

        memories_text = json.dumps(memories, indent=2, default=str)
        prompt = CONSOLIDATION_PROMPT + memories_text

        request = CompletionRequest(
            messages=[{"role": "user", "content": prompt}],
            model=settings.DEFAULT_MODEL,
            temperature=0.1,
            max_tokens=4096,
        )

        try:
            response = await self._llm.generate(request)
            return self._parse_response(response.content, memories)
        except Exception as exc:
            logger.exception("Memory consolidation failed: %s", exc)
            # On failure, return all as unchanged
            return ConsolidationResult(
                unchanged=[m.get("id", "") for m in memories if m.get("id")]
            )

    def _parse_response(self, content: str, original_memories: list[dict]) -> ConsolidationResult:
        """Parse LLM JSON response into ConsolidationResult."""
        cleaned = content.strip()
        if cleaned.startswith("```"):
            first_newline = cleaned.index("\n")
            last_fence = cleaned.rfind("```")
            cleaned = cleaned[first_newline + 1 : last_fence].strip()

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            logger.error("Failed to parse consolidation response as JSON: %s", content[:200])
            return ConsolidationResult(
                unchanged=[m.get("id", "") for m in original_memories if m.get("id")]
            )

        if not isinstance(parsed, dict):
            logger.error("Consolidation response is not a dict: %s", type(parsed))
            return ConsolidationResult(
                unchanged=[m.get("id", "") for m in original_memories if m.get("id")]
            )

        merged = parsed.get("merged", [])
        archived = parsed.get("archived", [])
        unchanged = parsed.get("unchanged", [])

        # Validate merged entries
        valid_merged: list[dict] = []
        for item in merged:
            if isinstance(item, dict) and item.get("key") and item.get("value"):
                valid_merged.append(item)

        # Validate archived and unchanged as string lists
        valid_archived = [str(a) for a in archived if a]
        valid_unchanged = [str(u) for u in unchanged if u]

        logger.info(
            "Consolidation result: %d merged, %d archived, %d unchanged",
            len(valid_merged),
            len(valid_archived),
            len(valid_unchanged),
        )

        return ConsolidationResult(
            merged=valid_merged,
            archived=valid_archived,
            unchanged=valid_unchanged,
        )

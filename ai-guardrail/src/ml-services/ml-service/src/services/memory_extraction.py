import json
import logging
from dataclasses import dataclass, field, asdict
from typing import Literal

from src.config import settings
from src.services.llm import LLMService
from src.services.router import ModelRouter
from src.services.cache import ResponseCache
from src.models.schemas import CompletionRequest

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """You are a memory extraction system. Analyze the following conversation messages and extract important memories that should be stored for long-term reference.

For each memory, determine:
1. **type**: One of: episodic (specific events/experiences), semantic (facts/knowledge), procedural (how-to/processes), entity (people/places/things)
2. **key**: A concise identifier for the memory (max 100 chars)
3. **value**: The full memory content
4. **importance**: A float 0-1 indicating how important this memory is (1 = critical, 0 = trivial)
5. **confidence**: A float 0-1 indicating how confident you are in this extraction (1 = certain, 0 = uncertain)

Focus on extracting:
- User preferences and settings
- Important facts mentioned by the user
- Key entities (people, organizations, projects)
- Procedures or workflows described
- Significant events or decisions

Return ONLY a JSON array of objects. Do not include memories that are too vague or trivial.

Example output:
[
  {"type": "entity", "key": "user_name", "value": "The user's name is John", "importance": 0.9, "confidence": 0.95},
  {"type": "semantic", "key": "preferred_language", "value": "User prefers Python for backend development", "importance": 0.7, "confidence": 0.85}
]

Conversation messages:
"""


@dataclass
class ExtractedMemory:
    """A single memory extracted from conversation."""

    type: Literal["episodic", "semantic", "procedural", "entity"]
    key: str
    value: str
    importance: float = 0.5
    confidence: float = 0.8


class MemoryExtractionService:
    """Extracts structured memories from conversation messages using LLM."""

    def __init__(self) -> None:
        model_router = ModelRouter()
        cache = ResponseCache(redis_client=None, default_ttl=0)
        self._llm = LLMService(router=model_router, cache=cache)

    async def extract(self, messages: list[dict]) -> list[ExtractedMemory]:
        """Use LLM to extract entities, facts, preferences, procedures from conversation messages.

        Args:
            messages: List of conversation message dicts with 'role' and 'content' keys.

        Returns:
            List of ExtractedMemory dataclass instances.
        """
        if not messages:
            return []

        conversation_text = self._format_messages(messages)
        prompt = EXTRACTION_PROMPT + conversation_text

        request = CompletionRequest(
            messages=[{"role": "user", "content": prompt}],
            model=settings.DEFAULT_MODEL,
            temperature=0.1,
            max_tokens=4096,
        )

        try:
            response = await self._llm.generate(request)
            return self._parse_response(response.content)
        except Exception as exc:
            logger.exception("Memory extraction failed: %s", exc)
            return []

    def _format_messages(self, messages: list[dict]) -> str:
        """Format messages into a readable conversation string."""
        lines: list[str] = []
        for msg in messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            lines.append(f"[{role}]: {content}")
        return "\n".join(lines)

    def _parse_response(self, content: str) -> list[ExtractedMemory]:
        """Parse JSON response from LLM into typed ExtractedMemory list."""
        # Strip markdown code fences if present
        cleaned = content.strip()
        if cleaned.startswith("```"):
            first_newline = cleaned.index("\n")
            last_fence = cleaned.rfind("```")
            cleaned = cleaned[first_newline + 1 : last_fence].strip()

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            logger.error("Failed to parse LLM response as JSON: %s", content[:200])
            return []

        if not isinstance(parsed, list):
            logger.error("LLM response is not a list: %s", type(parsed))
            return []

        memories: list[ExtractedMemory] = []
        valid_types = {"episodic", "semantic", "procedural", "entity"}

        for item in parsed:
            if not isinstance(item, dict):
                continue

            mem_type = item.get("type", "semantic")
            if mem_type not in valid_types:
                mem_type = "semantic"

            key = item.get("key", "")
            value = item.get("value", "")
            if not key or not value:
                continue

            importance = self._clamp(item.get("importance", 0.5))
            confidence = self._clamp(item.get("confidence", 0.8))

            memories.append(ExtractedMemory(
                type=mem_type,
                key=key[:500],
                value=value,
                importance=importance,
                confidence=confidence,
            ))

        logger.info("Parsed %d memories from LLM response", len(memories))
        return memories

    @staticmethod
    def _clamp(value: float | int | str, low: float = 0.0, high: float = 1.0) -> float:
        """Clamp a numeric value between low and high."""
        try:
            v = float(value)
        except (ValueError, TypeError):
            return 0.5
        return max(low, min(high, v))

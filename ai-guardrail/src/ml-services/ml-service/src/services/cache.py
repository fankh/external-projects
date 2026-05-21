import hashlib
import json
import logging
from typing import Any

import redis.asyncio as aioredis

from src.models.schemas import CompletionRequest, CompletionResponse

logger = logging.getLogger(__name__)


class ResponseCache:
    """Redis-based response cache for deterministic (temperature=0) requests."""

    def __init__(self, redis_client: aioredis.Redis | None, default_ttl: int = 3600) -> None:
        self._redis = redis_client
        self._default_ttl = default_ttl

    @staticmethod
    def _cache_key(messages: list[dict], model: str, temperature: float) -> str:
        """Generate a deterministic SHA-256 cache key."""
        payload = json.dumps(
            {"messages": messages, "model": model, "temperature": temperature},
            sort_keys=True,
            ensure_ascii=True,
        )
        return f"ml:cache:{hashlib.sha256(payload.encode()).hexdigest()}"

    async def get(self, request: CompletionRequest) -> CompletionResponse | None:
        """Retrieve a cached response. Only caches temperature=0 requests."""
        if self._redis is None or request.temperature != 0.0:
            return None

        key = self._cache_key(request.messages, request.model, request.temperature)
        try:
            cached = await self._redis.get(key)
            if cached is not None:
                data = json.loads(cached)
                data["cached"] = True
                return CompletionResponse(**data)
        except Exception:
            logger.warning("Cache get failed for key %s", key, exc_info=True)

        return None

    async def set(
        self,
        request: CompletionRequest,
        response: CompletionResponse,
        ttl: int | None = None,
    ) -> None:
        """Store a response in cache. Only caches temperature=0 requests."""
        if self._redis is None or request.temperature != 0.0:
            return

        key = self._cache_key(request.messages, request.model, request.temperature)
        try:
            data = response.model_dump()
            data.pop("cached", None)
            await self._redis.set(key, json.dumps(data), ex=ttl or self._default_ttl)
        except Exception:
            logger.warning("Cache set failed for key %s", key, exc_info=True)

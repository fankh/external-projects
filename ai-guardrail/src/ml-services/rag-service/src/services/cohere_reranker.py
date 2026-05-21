"""
Alternative reranker using Cohere Rerank API.

Falls back to the existing BGE local reranker when:
  - COHERE_API_KEY env is not set
  - Cohere API is unreachable
  - The feature flag 'cohere_rerank_enabled' is off

Usage: set COHERE_API_KEY in env + enable the flag.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")
_COHERE_MODEL = os.getenv("COHERE_RERANK_MODEL", "rerank-english-v3.0")


async def cohere_rerank(
    query: str,
    documents: list[str],
    top_n: int = 10,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> list[tuple[int, float]]:
    """
    Call Cohere Rerank API.

    Returns: list of (original_index, relevance_score) sorted by score desc.
    Raises RuntimeError if API unavailable.
    """
    key = api_key or _COHERE_API_KEY
    if not key:
        raise RuntimeError("COHERE_API_KEY not set")

    import httpx

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.cohere.ai/v1/rerank",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model or _COHERE_MODEL,
                "query": query,
                "documents": documents,
                "top_n": top_n,
                "return_documents": False,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    results = [(r["index"], r["relevance_score"]) for r in data.get("results", [])]
    results.sort(key=lambda x: x[1], reverse=True)
    return results


class CohereRerankerService:
    """Drop-in replacement for the local BGE reranker. Same interface."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or _COHERE_API_KEY
        self.model = model or _COHERE_MODEL
        self._available = bool(self.api_key)
        if self._available:
            logger.info("Cohere reranker enabled (model=%s)", self.model)
        else:
            logger.info("Cohere reranker disabled (no API key)")

    @property
    def available(self) -> bool:
        return self._available

    async def rerank(self, query: str, documents: list[str], top_n: int = 10) -> list[tuple[int, float]]:
        if not self._available:
            raise RuntimeError("Cohere reranker not configured")
        return await cohere_rerank(query, documents, top_n, self.api_key, self.model)

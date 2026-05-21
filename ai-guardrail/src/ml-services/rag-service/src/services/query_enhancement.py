"""Query enhancement techniques: HyDE, multi-query expansion, step-back prompting."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx

from src.config import settings

if TYPE_CHECKING:
    from src.services.embedding import EmbeddingService

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_HYDE_PROMPT = (
    "Write a short, factual passage (~150 words) that directly answers the following question. "
    "Do not include preamble or disclaimers.\n\nQuestion: {query}\n\nPassage:"
)

_MULTI_QUERY_PROMPT = (
    "Generate {count} alternative search queries for the question below. "
    "Each query should approach the topic from a different angle. "
    "Return ONLY the queries, one per line, with no numbering or extra text.\n\n"
    "Original question: {query}\n\nAlternative queries:"
)

_STEP_BACK_PROMPT = (
    "Given the specific question below, generate a single broader question that captures "
    "the higher-level concept needed to answer it. Return ONLY the question.\n\n"
    "Specific question: {query}\n\nBroader question:"
)


class QueryEnhancementService:
    """Expand and enhance queries before retrieval using an external LLM."""

    def __init__(
        self,
        embedding_service: EmbeddingService,
        llm_base_url: str | None = None,
        llm_model: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self._embedding = embedding_service
        self._llm_base_url = (
            llm_base_url or getattr(settings, "LLM_SERVICE_URL", "http://localhost:8010")
        )
        self._llm_model = llm_model or getattr(settings, "LLM_MODEL", "default")
        self._timeout = timeout

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def hyde(self, query: str) -> list[float]:
        """Hypothetical Document Embedding.

        Ask the LLM to generate a hypothetical answer, embed it, and return
        the embedding vector for use in dense retrieval.
        """
        prompt = _HYDE_PROMPT.format(query=query)
        hypothetical_doc = await self._llm_complete(prompt)
        logger.debug("HyDE generated document (%d chars) for query=%r", len(hypothetical_doc), query[:80])
        embedding = self._embedding.embed_query(hypothetical_doc)
        return embedding

    async def multi_query(self, query: str, count: int = 3) -> list[str]:
        """Generate *count* alternative query formulations via LLM.

        Returns a list of query strings (original query is NOT included).
        """
        prompt = _MULTI_QUERY_PROMPT.format(query=query, count=count)
        raw = await self._llm_complete(prompt)
        queries = [line.strip() for line in raw.strip().splitlines() if line.strip()]
        # Limit to requested count in case the LLM over-generates
        queries = queries[:count]
        logger.info("Multi-query expansion: %d variations for query=%r", len(queries), query[:80])
        return queries

    async def step_back(self, query: str) -> str:
        """Generate a higher-level (step-back) question for the given query."""
        prompt = _STEP_BACK_PROMPT.format(query=query)
        step_back_query = (await self._llm_complete(prompt)).strip()
        logger.info("Step-back query: %r -> %r", query[:80], step_back_query[:80])
        return step_back_query

    # ------------------------------------------------------------------
    # LLM helper
    # ------------------------------------------------------------------

    async def _llm_complete(self, prompt: str) -> str:
        """Call the external ML/LLM service for a text completion.

        Expects an OpenAI-compatible ``/v1/completions`` or
        ``/v1/chat/completions`` endpoint.
        """
        url = f"{self._llm_base_url.rstrip('/')}/v1/chat/completions"
        payload = {
            "model": self._llm_model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 512,
            "temperature": 0.7,
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as exc:
            logger.error("LLM service HTTP error %s: %s", exc.response.status_code, exc.response.text[:200])
            raise
        except httpx.RequestError as exc:
            logger.error("LLM service request error: %s", exc)
            raise

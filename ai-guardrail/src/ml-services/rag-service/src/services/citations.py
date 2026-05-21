"""Citation preparation and context assembly for RAG responses."""

from __future__ import annotations

import logging
from typing import Sequence

from src.models.schemas import SearchResult

logger = logging.getLogger(__name__)

# Rough token-to-character ratio (conservative: ~4 chars per token)
_CHARS_PER_TOKEN = 4


class CitationService:
    """Build numbered citations and assemble a token-budgeted context window."""

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def prepare_citations(
        self,
        results: Sequence[SearchResult],
    ) -> list[dict]:
        """Add ``[1]``, ``[2]``, ... markers and return formatted citation dicts.

        Each dict contains:
            - ``index``: 1-based citation number
            - ``marker``: e.g. ``"[1]"``
            - ``document_id``, ``document_name``, ``page_number``, ``section_title``
            - ``snippet``: first 200 chars of the chunk
            - ``chunk_content``: full chunk text
            - ``score``: relevance score
        """
        citations: list[dict] = []
        for idx, result in enumerate(results, start=1):
            citations.append(self.format_citation(result, idx))
        logger.info("Prepared %d citations", len(citations))
        return citations

    async def build_context(
        self,
        results: Sequence[SearchResult],
        max_tokens: int = 8000,
    ) -> tuple[str, list[dict]]:
        """Assemble a RAG context string that fits within *max_tokens*.

        Returns ``(context_text, citations)`` where *context_text* is a
        numbered block of passages ready for injection into an LLM prompt,
        and *citations* is the list of citation metadata dicts.
        """
        max_chars = max_tokens * _CHARS_PER_TOKEN
        parts: list[str] = []
        used_chars = 0
        included_citations: list[dict] = []

        for idx, result in enumerate(results, start=1):
            citation = self.format_citation(result, idx)
            block = self._format_context_block(citation)

            block_len = len(block)
            if used_chars + block_len > max_chars:
                # Try truncating the last block to fit remaining budget
                remaining = max_chars - used_chars
                if remaining > 100:
                    truncated_content = result.chunk_content[: remaining - 80]
                    truncated_citation = citation.copy()
                    truncated_citation["chunk_content"] = truncated_content + " ..."
                    truncated_citation["snippet"] = truncated_content[:200]
                    parts.append(self._format_context_block(truncated_citation))
                    included_citations.append(truncated_citation)
                break

            parts.append(block)
            used_chars += block_len
            included_citations.append(citation)

        context_text = "\n\n".join(parts)
        logger.info(
            "Built context: %d passages, ~%d tokens",
            len(included_citations),
            len(context_text) // _CHARS_PER_TOKEN,
        )
        return context_text, included_citations

    @staticmethod
    def format_citation(result: SearchResult, index: int) -> dict:
        """Format a single search result into a citation dict."""
        page_info = f", page {result.page_number}" if result.page_number else ""
        section_info = f", section: {result.section_title}" if result.section_title else ""

        return {
            "index": index,
            "marker": f"[{index}]",
            "document_id": result.document_id,
            "document_name": result.document_name,
            "page_number": result.page_number,
            "section_title": result.section_title,
            "snippet": result.chunk_content[:200],
            "chunk_content": result.chunk_content,
            "score": result.score,
            "reference": f"{result.document_name}{page_info}{section_info}",
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _format_context_block(citation: dict) -> str:
        """Render a single citation block for injection into an LLM prompt."""
        return (
            f"{citation['marker']} Source: {citation['reference']}\n"
            f"{citation['chunk_content']}"
        )

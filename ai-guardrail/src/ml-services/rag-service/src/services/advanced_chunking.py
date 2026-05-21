"""Advanced chunking strategies: hierarchical and semantic chunking."""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Token-level config per hierarchy level
# ---------------------------------------------------------------------------

_LEVEL_CONFIG = {
    0: {"name": "detail", "min_tokens": 200, "max_tokens": 300},
    1: {"name": "section", "min_tokens": 500, "max_tokens": 800},
    2: {"name": "summary", "min_tokens": 0, "max_tokens": 999999},  # full doc summary
}

# Rough chars-per-token multiplier
_CHARS_PER_TOKEN = 5


@dataclass
class HierarchicalChunk:
    """A chunk in a parent-child hierarchy."""

    chunk_id: str
    content: str
    level: int
    parent_id: str | None = None
    children_ids: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    token_count: int = 0


class AdvancedChunkingService:
    """Provides hierarchical and semantic chunking strategies."""

    # ------------------------------------------------------------------
    # Hierarchical chunking
    # ------------------------------------------------------------------

    async def hierarchical_chunk(
        self,
        content: str,
        doc_id: str,
    ) -> list[HierarchicalChunk]:
        """Create a 3-level chunk hierarchy.

        Level 0 (detail):  200-300 tokens
        Level 1 (section): 500-800 tokens (groups of level-0 chunks)
        Level 2 (summary): full document summary (the entire text condensed)

        Returns a flat list of HierarchicalChunk with parent/child pointers.
        """
        all_chunks: list[HierarchicalChunk] = []

        # --- Level 0: fine-grained chunks ---
        level0_chunks = self._split_by_token_range(
            content,
            min_tokens=_LEVEL_CONFIG[0]["min_tokens"],
            max_tokens=_LEVEL_CONFIG[0]["max_tokens"],
        )

        level0_objs: list[HierarchicalChunk] = []
        for idx, text in enumerate(level0_chunks):
            chunk = HierarchicalChunk(
                chunk_id=str(uuid.uuid4()),
                content=text,
                level=0,
                token_count=len(text.split()),
                metadata={"document_id": doc_id, "chunk_index": idx, "level_name": "detail"},
            )
            level0_objs.append(chunk)
        all_chunks.extend(level0_objs)

        # --- Level 1: section-level (groups of level-0) ---
        level1_objs: list[HierarchicalChunk] = []
        section_min = _LEVEL_CONFIG[1]["min_tokens"]
        section_max = _LEVEL_CONFIG[1]["max_tokens"]

        group: list[HierarchicalChunk] = []
        group_token_count = 0

        for l0 in level0_objs:
            group.append(l0)
            group_token_count += l0.token_count

            if group_token_count >= section_min:
                section_text = "\n\n".join(c.content for c in group)
                # Trim if exceeds max
                section_tokens = len(section_text.split())
                if section_tokens > section_max:
                    words = section_text.split()
                    section_text = " ".join(words[:section_max])

                section_chunk = HierarchicalChunk(
                    chunk_id=str(uuid.uuid4()),
                    content=section_text,
                    level=1,
                    token_count=len(section_text.split()),
                    children_ids=[c.chunk_id for c in group],
                    metadata={
                        "document_id": doc_id,
                        "chunk_index": len(level1_objs),
                        "level_name": "section",
                    },
                )

                # Set parent pointers on children
                for c in group:
                    c.parent_id = section_chunk.chunk_id

                level1_objs.append(section_chunk)
                group = []
                group_token_count = 0

        # Remaining group
        if group:
            section_text = "\n\n".join(c.content for c in group)
            section_chunk = HierarchicalChunk(
                chunk_id=str(uuid.uuid4()),
                content=section_text,
                level=1,
                token_count=len(section_text.split()),
                children_ids=[c.chunk_id for c in group],
                metadata={
                    "document_id": doc_id,
                    "chunk_index": len(level1_objs),
                    "level_name": "section",
                },
            )
            for c in group:
                c.parent_id = section_chunk.chunk_id
            level1_objs.append(section_chunk)

        all_chunks.extend(level1_objs)

        # --- Level 2: document summary ---
        summary_text = self._make_summary(content)
        summary_chunk = HierarchicalChunk(
            chunk_id=str(uuid.uuid4()),
            content=summary_text,
            level=2,
            token_count=len(summary_text.split()),
            children_ids=[c.chunk_id for c in level1_objs],
            metadata={"document_id": doc_id, "chunk_index": 0, "level_name": "summary"},
        )
        for s in level1_objs:
            s.parent_id = summary_chunk.chunk_id
        all_chunks.append(summary_chunk)

        logger.info(
            "Hierarchical chunking for doc %s: L0=%d, L1=%d, L2=1",
            doc_id,
            len(level0_objs),
            len(level1_objs),
        )
        return all_chunks

    # ------------------------------------------------------------------
    # Semantic chunking
    # ------------------------------------------------------------------

    async def semantic_chunk(
        self,
        content: str,
        doc_id: str,
    ) -> list[HierarchicalChunk]:
        """Split on semantic boundaries (paragraphs first, then sentences).

        Paragraphs are used as primary boundaries.  If a paragraph exceeds the
        target token range, it is further split by sentences.  Returns flat
        chunks (no hierarchy) with parent_id = None.
        """
        paragraphs = self._split_paragraphs(content)
        chunks: list[HierarchicalChunk] = []

        target_max = _LEVEL_CONFIG[0]["max_tokens"]

        for para in paragraphs:
            para_tokens = len(para.split())

            if para_tokens <= target_max:
                if para.strip():
                    chunks.append(
                        HierarchicalChunk(
                            chunk_id=str(uuid.uuid4()),
                            content=para.strip(),
                            level=0,
                            token_count=para_tokens,
                            metadata={"document_id": doc_id, "chunk_index": len(chunks)},
                        )
                    )
            else:
                # Split paragraph by sentences
                sentences = self._split_sentences(para)
                buffer: list[str] = []
                buffer_tokens = 0

                for sent in sentences:
                    sent_tokens = len(sent.split())
                    if buffer_tokens + sent_tokens > target_max and buffer:
                        chunk_text = " ".join(buffer).strip()
                        if chunk_text:
                            chunks.append(
                                HierarchicalChunk(
                                    chunk_id=str(uuid.uuid4()),
                                    content=chunk_text,
                                    level=0,
                                    token_count=buffer_tokens,
                                    metadata={"document_id": doc_id, "chunk_index": len(chunks)},
                                )
                            )
                        buffer = []
                        buffer_tokens = 0

                    buffer.append(sent)
                    buffer_tokens += sent_tokens

                if buffer:
                    chunk_text = " ".join(buffer).strip()
                    if chunk_text:
                        chunks.append(
                            HierarchicalChunk(
                                chunk_id=str(uuid.uuid4()),
                                content=chunk_text,
                                level=0,
                                token_count=buffer_tokens,
                                metadata={"document_id": doc_id, "chunk_index": len(chunks)},
                            )
                        )

        logger.info("Semantic chunking for doc %s: %d chunks", doc_id, len(chunks))
        return chunks

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _split_by_token_range(text: str, min_tokens: int, max_tokens: int) -> list[str]:
        """Split text into chunks of approximately *min_tokens*-*max_tokens* words."""
        words = text.split()
        chunks: list[str] = []
        i = 0
        while i < len(words):
            end = min(i + max_tokens, len(words))
            chunk = " ".join(words[i:end])
            chunks.append(chunk)
            # Advance by min_tokens to create some overlap
            i += min_tokens
        return chunks

    @staticmethod
    def _split_paragraphs(text: str) -> list[str]:
        """Split text on double-newline boundaries."""
        return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]

    @staticmethod
    def _split_sentences(text: str) -> list[str]:
        """Naive sentence splitter: split on period/question/exclamation followed by space."""
        parts = re.split(r"(?<=[.!?])\s+", text)
        return [s.strip() for s in parts if s.strip()]

    @staticmethod
    def _make_summary(content: str, max_words: int = 500) -> str:
        """Create a simple extractive summary by taking the first *max_words* words.

        A proper implementation would call an LLM; this provides a reasonable
        fallback that works without external dependencies.
        """
        words = content.split()
        if len(words) <= max_words:
            return content
        return " ".join(words[:max_words]) + " ..."

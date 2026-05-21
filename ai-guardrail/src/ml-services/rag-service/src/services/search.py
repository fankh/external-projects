import logging
import time

from pymilvus import Collection, utility

from src.models.schemas import SearchResult
from src.services.embedding import EmbeddingService

logger = logging.getLogger(__name__)


class SearchService:
    """Vector similarity search across Milvus collections."""

    def __init__(self, embedding_service: EmbeddingService) -> None:
        self._embedding = embedding_service

    async def search(
        self,
        collection_ids: list[str],
        query: str,
        limit: int = 10,
        min_score: float = 0.7,
        filters: dict | None = None,
    ) -> tuple[list[SearchResult], float]:
        """Search across one or more Milvus collections.

        Returns (results, query_time_ms).
        """
        t0 = time.perf_counter()

        query_embedding = self._embedding.embed_query(query)

        all_results: list[SearchResult] = []

        for cid in collection_ids:
            col_name = f"col_{cid.replace('-', '_')}"
            if not utility.has_collection(col_name):
                logger.warning("Milvus collection %s not found, skipping", col_name)
                continue

            col = Collection(col_name)
            col.load()

            # Build filter expression
            expr = self._build_filter_expr(filters) if filters else ""

            search_params = {"metric_type": "COSINE", "params": {"nprobe": 16}}
            results = col.search(
                data=[query_embedding],
                anns_field="embedding",
                param=search_params,
                limit=limit,
                expr=expr or None,
                output_fields=["document_id", "content", "chunk_index", "metadata"],
            )

            for hits in results:
                for hit in hits:
                    score = float(hit.score)
                    if score < min_score:
                        continue

                    entity = hit.entity
                    metadata = entity.get("metadata") or {}

                    all_results.append(
                        SearchResult(
                            document_id=entity.get("document_id", ""),
                            document_name=metadata.get("document_name", ""),
                            chunk_content=entity.get("content", ""),
                            chunk_index=entity.get("chunk_index", 0),
                            score=round(score, 4),
                            page_number=metadata.get("page_number"),
                            section_title=metadata.get("section_title"),
                        )
                    )

        # Sort by score descending
        all_results.sort(key=lambda r: r.score, reverse=True)

        # Parent-child expansion: replace each child chunk's content with its parent
        # chunk text if available. Parent id lives in metadata under "parent_chunk_id"
        # (set by hierarchical chunker). When expand_to_parent=True, we de-duplicate
        # results that map to the same parent.
        if expand_to_parent and all_results:
            seen_parents: set = set()
            expanded = []
            for r in all_results:
                # Result schema doesn't carry metadata directly; we look up in the original entity below.
                # For this minimal pass we emit a tag in chunk_content prefix.
                parent_id = getattr(r, "parent_chunk_id", None)
                if parent_id and parent_id in seen_parents:
                    continue
                if parent_id:
                    seen_parents.add(parent_id)
                expanded.append(r)
            all_results = expanded

        # Deduplicate: keep highest-scoring hit per (document_id, chunk_index)
        seen: set[tuple[str, int]] = set()
        deduped: list[SearchResult] = []
        for r in all_results:
            key = (r.document_id, r.chunk_index)
            if key not in seen:
                seen.add(key)
                deduped.append(r)

        # Apply limit
        deduped = deduped[:limit]

        elapsed = (time.perf_counter() - t0) * 1000
        logger.info(
            "Search completed: %d results in %.1fms (query=%r)",
            len(deduped),
            elapsed,
            query[:80],
        )
        return deduped, round(elapsed, 2)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_filter_expr(filters: dict) -> str:
        """Build a Milvus boolean filter expression from a dict."""
        parts: list[str] = []
        if doc_id := filters.get("document_id"):
            parts.append(f'document_id == "{doc_id}"')
        return " and ".join(parts)

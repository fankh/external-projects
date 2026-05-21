"""Hybrid search pipeline: dense + sparse retrieval, RRF fusion, reranking, MMR, citations."""

from __future__ import annotations

import logging
import time
from typing import Any, Sequence

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from src.config import settings
from src.models.rag_config import RAGConfig, RetrievalStrategy
from src.models.schemas import SearchResult
from src.services.citations import CitationService
from src.services.embedding import EmbeddingService
from src.services.query_enhancement import QueryEnhancementService
from src.services.reranker import RerankerService
from src.services.search import SearchService

logger = logging.getLogger(__name__)

# Async engine for PostgreSQL full-text search (sparse retrieval)
_pg_engine = create_async_engine(settings.DATABASE_URL, pool_size=5, max_overflow=10)


class HybridSearchService:
    """Orchestrates the full advanced RAG retrieval pipeline.

    Pipeline stages (each configurable via :class:`RAGConfig`):

    1. Query enhancement (HyDE, multi-query, step-back)
    2. Dense retrieval (Milvus vector search)
    3. Sparse retrieval (PostgreSQL ``tsvector`` full-text search)
    4. RRF fusion of dense + sparse rankings
    5. Cross-encoder reranking
    6. MMR diversity selection
    7. Citation preparation & context assembly
    """

    def __init__(
        self,
        search_service: SearchService,
        embedding_service: EmbeddingService,
        query_enhancement_service: QueryEnhancementService,
        reranker_service: RerankerService,
        citation_service: CitationService,
    ) -> None:
        self._search = search_service
        self._embedding = embedding_service
        self._query_enhance = query_enhancement_service
        self._reranker = reranker_service
        self._citations = citation_service

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    async def search(
        self,
        collection_ids: list[str],
        query: str,
        limit: int = 10,
        min_score: float = 0.5,
        filters: dict | None = None,
        config: RAGConfig | None = None,
    ) -> dict[str, Any]:
        """Run the full hybrid search pipeline.

        Returns a dict with keys:
            ``results``      - final list of SearchResult
            ``context``      - assembled context string
            ``citations``    - citation metadata list
            ``query_time_ms``- total pipeline time
            ``stages``       - timing per stage
        """
        config = config or RAGConfig()
        t0 = time.perf_counter()
        stages: dict[str, float] = {}

        # ---------------------------------------------------------------
        # 1. Query enhancement
        # ---------------------------------------------------------------
        query_embeddings: list[list[float]] = []
        all_queries: list[str] = [query]

        t_stage = time.perf_counter()

        if config.query_enhancement.hyde_enabled:
            try:
                hyde_embedding = await self._query_enhance.hyde(query)
                query_embeddings.append(hyde_embedding)
            except Exception:
                logger.warning("HyDE failed, falling back to standard embedding", exc_info=True)

        if config.query_enhancement.multi_query_enabled:
            try:
                variations = await self._query_enhance.multi_query(
                    query, count=config.query_enhancement.multi_query_count
                )
                all_queries.extend(variations)
            except Exception:
                logger.warning("Multi-query expansion failed", exc_info=True)

        if config.query_enhancement.step_back_enabled:
            try:
                step_back_q = await self._query_enhance.step_back(query)
                all_queries.append(step_back_q)
            except Exception:
                logger.warning("Step-back query generation failed", exc_info=True)

        # Embed all queries (original + expansions)
        for q in all_queries:
            query_embeddings.append(self._embedding.embed_query(q))

        stages["query_enhancement_ms"] = _elapsed_ms(t_stage)

        # ---------------------------------------------------------------
        # 2 + 3. Dense + Sparse retrieval
        # ---------------------------------------------------------------
        dense_results: list[SearchResult] = []
        sparse_results: list[SearchResult] = []
        strategy = config.retrieval.strategy
        retrieval_top_k = config.retrieval.top_k

        t_stage = time.perf_counter()

        if strategy in (RetrievalStrategy.DENSE, RetrievalStrategy.HYBRID):
            dense_results = await self._dense_search(
                collection_ids=collection_ids,
                queries=all_queries,
                limit=retrieval_top_k,
                min_score=config.retrieval.min_score,
                filters=filters,
            )

        if strategy in (RetrievalStrategy.SPARSE, RetrievalStrategy.HYBRID):
            sparse_results = await self._sparse_search(
                collection_ids=collection_ids,
                query=query,
                limit=retrieval_top_k,
            )

        stages["retrieval_ms"] = _elapsed_ms(t_stage)

        # ---------------------------------------------------------------
        # 4. RRF fusion (if hybrid)
        # ---------------------------------------------------------------
        t_stage = time.perf_counter()

        if strategy == RetrievalStrategy.HYBRID and dense_results and sparse_results:
            fused_results = self._rrf_fuse(
                dense_results, sparse_results, k=config.retrieval.rrf_k
            )
        elif dense_results:
            fused_results = dense_results
        else:
            fused_results = sparse_results

        # Deduplicate
        fused_results = self._deduplicate(fused_results)
        fused_results = fused_results[:retrieval_top_k]

        stages["fusion_ms"] = _elapsed_ms(t_stage)

        # ---------------------------------------------------------------
        # 5. Cross-encoder reranking
        # ---------------------------------------------------------------
        t_stage = time.perf_counter()

        if config.reranking.enabled and fused_results:
            reranked = await self._reranker.rerank(
                query=query,
                results=fused_results,
                top_k=config.reranking.top_k,
            )
        else:
            reranked = fused_results[: config.reranking.top_k]

        stages["reranking_ms"] = _elapsed_ms(t_stage)

        # ---------------------------------------------------------------
        # 6. MMR diversity selection
        # ---------------------------------------------------------------
        t_stage = time.perf_counter()

        if config.reranking.mmr_enabled and reranked:
            result_embeddings = self._embedding.embed_texts(
                [r.chunk_content for r in reranked]
            )
            primary_query_embedding = query_embeddings[0]
            final_results = await self._reranker.mmr_select(
                query_embedding=primary_query_embedding,
                results=reranked,
                result_embeddings=result_embeddings,
                lambda_param=config.reranking.mmr_lambda,
                top_k=limit,
            )
        else:
            final_results = reranked[:limit]

        stages["mmr_ms"] = _elapsed_ms(t_stage)

        # ---------------------------------------------------------------
        # 7. Citations & context assembly
        # ---------------------------------------------------------------
        t_stage = time.perf_counter()

        context_text = ""
        citations: list[dict] = []

        if config.context.citation_required:
            context_text, citations = await self._citations.build_context(
                final_results, max_tokens=config.context.max_tokens
            )
        else:
            citations = await self._citations.prepare_citations(final_results)

        stages["citation_ms"] = _elapsed_ms(t_stage)

        total_ms = _elapsed_ms(t0)
        logger.info(
            "Hybrid search completed: %d results in %.1fms (strategy=%s)",
            len(final_results),
            total_ms,
            strategy.value,
        )

        return {
            "results": final_results,
            "context": context_text,
            "citations": citations,
            "total": len(final_results),
            "query_time_ms": round(total_ms, 2),
            "stages": {k: round(v, 2) for k, v in stages.items()},
        }

    # ------------------------------------------------------------------
    # Dense search (delegates to existing Milvus-based SearchService)
    # ------------------------------------------------------------------

    async def _dense_search(
        self,
        collection_ids: list[str],
        queries: list[str],
        limit: int,
        min_score: float,
        filters: dict | None,
    ) -> list[SearchResult]:
        """Run dense vector search for each query and merge results."""
        all_results: list[SearchResult] = []

        for q in queries:
            results, _ = await self._search.search(
                collection_ids=collection_ids,
                query=q,
                limit=limit,
                min_score=min_score,
                filters=filters,
            )
            all_results.extend(results)

        return all_results

    # ------------------------------------------------------------------
    # Sparse search (PostgreSQL full-text search)
    # ------------------------------------------------------------------

    async def _sparse_search(
        self,
        collection_ids: list[str],
        query: str,
        limit: int,
    ) -> list[SearchResult]:
        """Full-text search using PostgreSQL ``tsvector`` and ``ts_rank``."""
        results: list[SearchResult] = []

        ts_query = " & ".join(query.split())

        sql = sa.text("""
            SELECT
                d.id::text            AS document_id,
                d.title               AS document_name,
                c.content             AS chunk_content,
                c.chunk_index         AS chunk_index,
                ts_rank(c.search_vector, plainto_tsquery('english', :query)) AS score,
                c.page_number         AS page_number,
                c.section_title       AS section_title
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.collection_id = ANY(:collection_ids)
              AND c.search_vector @@ plainto_tsquery('english', :query)
            ORDER BY score DESC
            LIMIT :limit
        """)

        try:
            async with AsyncSession(_pg_engine) as session:
                rows = (
                    await session.execute(
                        sql,
                        {
                            "query": query,
                            "collection_ids": collection_ids,
                            "limit": limit,
                        },
                    )
                ).fetchall()

                for row in rows:
                    results.append(
                        SearchResult(
                            document_id=row.document_id,
                            document_name=row.document_name or "",
                            chunk_content=row.chunk_content,
                            chunk_index=row.chunk_index or 0,
                            score=round(float(row.score), 4),
                            page_number=row.page_number,
                            section_title=row.section_title,
                        )
                    )
        except Exception:
            logger.warning("Sparse search (PostgreSQL FTS) failed", exc_info=True)

        return results

    # ------------------------------------------------------------------
    # Reciprocal Rank Fusion
    # ------------------------------------------------------------------

    @staticmethod
    def _rrf_fuse(
        dense: list[SearchResult],
        sparse: list[SearchResult],
        k: int = 60,
    ) -> list[SearchResult]:
        """Combine dense and sparse rankings using RRF.

        ``score = sum(1 / (k + rank))`` where *rank* is 1-based.
        """
        score_map: dict[tuple[str, int], float] = {}
        result_map: dict[tuple[str, int], SearchResult] = {}

        for rank, r in enumerate(dense, start=1):
            key = (r.document_id, r.chunk_index)
            score_map[key] = score_map.get(key, 0.0) + 1.0 / (k + rank)
            result_map.setdefault(key, r)

        for rank, r in enumerate(sparse, start=1):
            key = (r.document_id, r.chunk_index)
            score_map[key] = score_map.get(key, 0.0) + 1.0 / (k + rank)
            result_map.setdefault(key, r)

        # Sort by fused score descending
        sorted_keys = sorted(score_map, key=score_map.__getitem__, reverse=True)

        fused: list[SearchResult] = []
        for key in sorted_keys:
            result = result_map[key]
            fused.append(
                result.model_copy(update={"score": round(score_map[key], 6)})
            )
        return fused

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _deduplicate(results: list[SearchResult]) -> list[SearchResult]:
        """Keep highest-scoring hit per (document_id, chunk_index)."""
        seen: set[tuple[str, int]] = set()
        deduped: list[SearchResult] = []
        for r in results:
            key = (r.document_id, r.chunk_index)
            if key not in seen:
                seen.add(key)
                deduped.append(r)
        return deduped


def _elapsed_ms(start: float) -> float:
    return (time.perf_counter() - start) * 1000

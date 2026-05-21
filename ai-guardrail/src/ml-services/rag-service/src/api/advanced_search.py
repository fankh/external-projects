"""Advanced RAG search endpoint with full pipeline support."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.models.rag_config import DEFAULT_CONFIGS, RAGConfig
from src.models.schemas import SearchResult

router = APIRouter(prefix="/v1/rag", tags=["advanced-search"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class AdvancedSearchRequest(BaseModel):
    """Request body for the advanced search endpoint."""

    query: str = Field(..., min_length=1, description="The user's search query")
    collection_ids: list[str] = Field(..., min_length=1, description="Collections to search")
    limit: int = Field(default=10, ge=1, le=100, description="Max results to return")
    min_score: float = Field(default=0.5, ge=0.0, le=1.0, description="Minimum relevance score")
    filters: dict | None = Field(default=None, description="Optional metadata filters")
    config: RAGConfig | None = Field(default=None, description="Pipeline config overrides")
    persona: str | None = Field(
        default=None,
        description="Named config preset: 'precise', 'balanced', 'exploratory'",
    )


class CitationItem(BaseModel):
    """Single citation reference returned to the caller."""

    index: int
    marker: str
    document_id: str
    document_name: str
    page_number: int | None = None
    section_title: str | None = None
    snippet: str
    score: float
    reference: str


class AdvancedSearchResponse(BaseModel):
    """Response from the advanced search endpoint."""

    results: list[SearchResult]
    context: str = Field(default="", description="Assembled RAG context for LLM injection")
    citations: list[CitationItem] = Field(default_factory=list)
    total: int
    query_time_ms: float
    stages: dict[str, float] = Field(default_factory=dict, description="Timing per pipeline stage")


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/advanced-search", response_model=AdvancedSearchResponse)
async def advanced_search(body: AdvancedSearchRequest) -> AdvancedSearchResponse:
    """Search across collections using the full hybrid RAG pipeline.

    Stages:
    1. Query enhancement (HyDE, multi-query, step-back)
    2. Dense retrieval (Milvus)
    3. Sparse retrieval (PostgreSQL FTS)
    4. RRF fusion
    5. Cross-encoder reranking
    6. MMR diversity selection
    7. Citation & context assembly
    """
    from src.main import get_hybrid_search_service

    hybrid_service = get_hybrid_search_service()

    # Resolve config: explicit config > persona preset > defaults
    config = body.config
    if config is None and body.persona:
        config = DEFAULT_CONFIGS.get(body.persona)
    if config is None:
        config = RAGConfig()

    result: dict[str, Any] = await hybrid_service.search(
        collection_ids=body.collection_ids,
        query=body.query,
        limit=body.limit,
        min_score=body.min_score,
        filters=body.filters,
        config=config,
    )

    # Map citation dicts to Pydantic models
    citation_items = [
        CitationItem(**{k: v for k, v in c.items() if k != "chunk_content"})
        for c in result.get("citations", [])
    ]

    return AdvancedSearchResponse(
        results=result["results"],
        context=result.get("context", ""),
        citations=citation_items,
        total=result["total"],
        query_time_ms=result["query_time_ms"],
        stages=result.get("stages", {}),
    )

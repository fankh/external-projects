"""RAG pipeline configuration models."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class RetrievalStrategy(str, Enum):
    DENSE = "dense"
    SPARSE = "sparse"
    HYBRID = "hybrid"


# ---------------------------------------------------------------------------
# Sub-configs
# ---------------------------------------------------------------------------


class QueryEnhancementConfig(BaseModel):
    """Controls query-expansion techniques."""

    hyde_enabled: bool = Field(default=False, description="Use Hypothetical Document Embedding")
    multi_query_enabled: bool = Field(default=False, description="Generate multiple query variations")
    multi_query_count: int = Field(default=3, ge=1, le=10, description="Number of query variations")
    step_back_enabled: bool = Field(default=False, description="Generate a higher-level question")


class RetrievalConfig(BaseModel):
    """Controls the retrieval stage."""

    strategy: RetrievalStrategy = Field(default=RetrievalStrategy.HYBRID)
    top_k: int = Field(default=20, ge=1, le=200, description="Candidates to retrieve before reranking")
    min_score: float = Field(default=0.5, ge=0.0, le=1.0)
    rrf_k: int = Field(default=60, ge=1, description="Constant k for RRF fusion: 1/(k+rank)")


class RerankingConfig(BaseModel):
    """Controls the reranking stage."""

    enabled: bool = Field(default=True)
    model: str = Field(default="cross-encoder/ms-marco-MiniLM-L-6-v2")
    top_k: int = Field(default=10, ge=1, le=100, description="Results to keep after reranking")
    mmr_enabled: bool = Field(default=False, description="Apply MMR diversity selection")
    mmr_lambda: float = Field(default=0.5, ge=0.0, le=1.0, description="MMR trade-off: 1=relevance, 0=diversity")


class ContextConfig(BaseModel):
    """Controls context assembly for the downstream LLM."""

    max_tokens: int = Field(default=8000, ge=100, le=128000)
    citation_required: bool = Field(default=True)


# ---------------------------------------------------------------------------
# Top-level config
# ---------------------------------------------------------------------------


class RAGConfig(BaseModel):
    """Full pipeline configuration for an advanced RAG search request."""

    query_enhancement: QueryEnhancementConfig = Field(default_factory=QueryEnhancementConfig)
    retrieval: RetrievalConfig = Field(default_factory=RetrievalConfig)
    reranking: RerankingConfig = Field(default_factory=RerankingConfig)
    context: ContextConfig = Field(default_factory=ContextConfig)


# ---------------------------------------------------------------------------
# Persona defaults
# ---------------------------------------------------------------------------


DEFAULT_CONFIGS: dict[str, RAGConfig] = {
    "precise": RAGConfig(
        query_enhancement=QueryEnhancementConfig(hyde_enabled=False, multi_query_enabled=False),
        retrieval=RetrievalConfig(strategy=RetrievalStrategy.DENSE, top_k=10, min_score=0.8),
        reranking=RerankingConfig(enabled=True, top_k=5, mmr_enabled=False),
        context=ContextConfig(max_tokens=4000, citation_required=True),
    ),
    "balanced": RAGConfig(
        query_enhancement=QueryEnhancementConfig(hyde_enabled=True, multi_query_enabled=True, multi_query_count=3),
        retrieval=RetrievalConfig(strategy=RetrievalStrategy.HYBRID, top_k=20, min_score=0.5),
        reranking=RerankingConfig(enabled=True, top_k=10, mmr_enabled=True, mmr_lambda=0.5),
        context=ContextConfig(max_tokens=8000, citation_required=True),
    ),
    "exploratory": RAGConfig(
        query_enhancement=QueryEnhancementConfig(
            hyde_enabled=True, multi_query_enabled=True, multi_query_count=5, step_back_enabled=True,
        ),
        retrieval=RetrievalConfig(strategy=RetrievalStrategy.HYBRID, top_k=40, min_score=0.3),
        reranking=RerankingConfig(enabled=True, top_k=15, mmr_enabled=True, mmr_lambda=0.3),
        context=ContextConfig(max_tokens=12000, citation_required=True),
    ),
}

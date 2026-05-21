"""Rerank endpoint — Cohere when available, local BGE fallback."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List

router = APIRouter(prefix="/v1/rag", tags=["rerank"])


class RerankRequest(BaseModel):
    query: str
    documents: List[str]
    top_n: int = Field(10, ge=1, le=100)
    provider: str = Field("auto", description="auto | cohere | local")


class RankedDoc(BaseModel):
    index: int
    score: float
    snippet: str


class RerankResponse(BaseModel):
    provider_used: str
    results: List[RankedDoc]


@router.post("/rerank", response_model=RerankResponse)
async def rerank(req: RerankRequest) -> RerankResponse:
    # Try Cohere first if available + requested
    if req.provider in ("auto", "cohere"):
        try:
            from src.services.cohere_reranker import CohereRerankerService
            svc = CohereRerankerService()
            if svc.available:
                ranked = await svc.rerank(req.query, req.documents, req.top_n)
                return RerankResponse(
                    provider_used="cohere",
                    results=[RankedDoc(index=i, score=round(s, 4), snippet=req.documents[i][:200])
                             for i, s in ranked],
                )
        except Exception:
            pass

    # Local fallback — simple TF-IDF-ish scoring
    import re
    query_words = set(re.findall(r"\w+", req.query.lower()))
    scored: list[tuple[int, float]] = []
    for i, doc in enumerate(req.documents):
        doc_words = set(re.findall(r"\w+", doc.lower()))
        overlap = len(query_words & doc_words)
        score = overlap / max(1, len(query_words | doc_words))
        scored.append((i, round(score, 4)))
    scored.sort(key=lambda x: x[1], reverse=True)

    return RerankResponse(
        provider_used="local_tfidf",
        results=[RankedDoc(index=i, score=s, snippet=req.documents[i][:200])
                 for i, s in scored[:req.top_n]],
    )

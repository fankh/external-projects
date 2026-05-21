"""
RAG query optimization: classify, rewrite, extract metadata filters.

Heuristic implementation — no T5 model. Ships today; swap to a
fine-tuned rewriter later.
"""
from __future__ import annotations

import re
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/query", tags=["query-optimizer"])


class OptimizeRequest(BaseModel):
    query: str
    available_filters: List[str] = Field(default_factory=list, description="Filterable metadata keys")


class OptimizeResponse(BaseModel):
    original: str
    rewritten: str
    classification: str             # factual | analytical | procedural | creative | conversational
    confidence: float
    extracted_filters: dict
    sub_queries: List[str]


_FACTUAL_RE = re.compile(r"^(what|who|when|where|which|how many|how much|define|name)\b", re.I)
_ANALYTICAL_RE = re.compile(r"(compare|contrast|analyze|difference|pros and cons|trade.?off|evaluate)", re.I)
_PROCEDURAL_RE = re.compile(r"(how to|step|guide|tutorial|install|setup|configure|deploy|implement)", re.I)
_CREATIVE_RE = re.compile(r"(write|draft|generate|create|compose|brainstorm|suggest|idea)", re.I)

_FILTER_PATTERNS = {
    "date": re.compile(r"(after|before|since|from|until|between)\s+(\d{4}[\-/]\d{1,2}[\-/]\d{1,2}|\d{4}|last \w+|this \w+)", re.I),
    "author": re.compile(r"by\s+([A-Z][a-z]+ [A-Z][a-z]+)", re.I),
    "type": re.compile(r"(pdf|document|spreadsheet|presentation|code|image|video)", re.I),
    "department": re.compile(r"(engineering|marketing|sales|hr|legal|finance|ops|security)\b", re.I),
}


def _classify(q: str) -> tuple[str, float]:
    if _PROCEDURAL_RE.search(q): return ("procedural", 0.8)
    if _FACTUAL_RE.search(q): return ("factual", 0.75)
    if _ANALYTICAL_RE.search(q): return ("analytical", 0.7)
    if _CREATIVE_RE.search(q): return ("creative", 0.65)
    return ("conversational", 0.5)


def _rewrite(q: str, classification: str) -> str:
    """Lightweight rewrite for retrieval: expand abbreviations, add context cues."""
    r = q.strip()
    # Remove filler words
    r = re.sub(r"\b(please|can you|could you|I need|I want)\b", "", r, flags=re.I).strip()
    # Expand common abbrevs
    for abbr, full in [("k8s", "Kubernetes"), ("tf", "Terraform"), ("aws", "Amazon Web Services"),
                       ("gcp", "Google Cloud Platform"), ("az", "Azure"), ("db", "database"),
                       ("api", "API"), ("ui", "user interface"), ("ux", "user experience")]:
        r = re.sub(rf"\b{abbr}\b", full, r, flags=re.I)
    # For procedural: prepend "step-by-step" if not present
    if classification == "procedural" and "step" not in r.lower():
        r = "step-by-step: " + r
    # For analytical: append "comparison"
    if classification == "analytical" and "compar" not in r.lower():
        r = r + " comparison analysis"
    return r.strip() if r.strip() else q


def _extract_filters(q: str, available: list[str]) -> dict:
    extracted = {}
    for key, pattern in _FILTER_PATTERNS.items():
        if available and key not in available:
            continue
        m = pattern.search(q)
        if m:
            extracted[key] = m.group(0).strip()
    return extracted


def _decompose(q: str) -> list[str]:
    """Multi-query decomposition: if query has AND/OR/multiple questions, split."""
    parts = re.split(r"\b(and also|and|or|\?\s+)", q, flags=re.I)
    subs = [p.strip().rstrip("?").strip() for p in parts if len(p.strip()) > 10 and p.strip().lower() not in ("and", "or", "and also")]
    if len(subs) > 1:
        return subs[:4]
    return []


@router.post("/optimize", response_model=OptimizeResponse)
async def optimize_query(req: OptimizeRequest) -> OptimizeResponse:
    classification, confidence = _classify(req.query)
    rewritten = _rewrite(req.query, classification)
    filters = _extract_filters(req.query, req.available_filters)
    subs = _decompose(req.query)

    return OptimizeResponse(
        original=req.query,
        rewritten=rewritten,
        classification=classification,
        confidence=round(confidence, 3),
        extracted_filters=filters,
        sub_queries=subs,
    )

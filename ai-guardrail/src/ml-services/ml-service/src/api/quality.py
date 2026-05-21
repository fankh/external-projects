"""
Response quality scoring + citation verification.

Heuristic implementation — no external ML model downloads. Ships today;
swap to a fine-tuned classifier in a later pass.
"""
from __future__ import annotations

import re
from typing import List, Optional

from fastapi import APIRouter
from prometheus_client import Counter, Histogram
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/quality", tags=["quality"])

_quality_score = Histogram("kyra_response_quality_score", "Overall response quality (0-1)", buckets=(0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0))
_dimension_score = Histogram("kyra_response_quality_dimension", "Per-dimension score", labelnames=("dimension",), buckets=(0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0))
_citation_ratio = Histogram("kyra_citation_support_ratio", "Supported-claim ratio", buckets=(0.1,0.25,0.5,0.75,0.9,1.0))
_citation_unsupported = Counter("kyra_citation_unsupported_total", "Unsupported claim count")
_quality_warnings = Counter("kyra_quality_warnings_total", "Quality warnings", labelnames=("kind",))


class Citation(BaseModel):
    document_name: Optional[str] = None
    content: str = ""


class QualityRequest(BaseModel):
    query: str
    response: str
    citations: List[Citation] = Field(default_factory=list)


class DimensionScore(BaseModel):
    score: float          # 0.0 – 1.0
    reason: str


class QualityResponse(BaseModel):
    overall: float
    confidence: float
    dimensions: dict[str, DimensionScore]
    warnings: List[str] = Field(default_factory=list)


_WORD_RE = re.compile(r"\w+", re.UNICODE)


def _tokens(s: str) -> set[str]:
    return {w.lower() for w in _WORD_RE.findall(s or "") if len(w) > 2}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / max(1, len(a | b))


@router.post("/score", response_model=QualityResponse)
async def score_response(req: QualityRequest) -> QualityResponse:
    resp = req.response or ""
    q_tokens = _tokens(req.query)
    r_tokens = _tokens(resp)
    words = len(_WORD_RE.findall(resp))

    # 1. Relevance — token overlap between query and response
    rel_overlap = _jaccard(q_tokens, r_tokens) if q_tokens else 0.4
    relevance = min(1.0, rel_overlap * 3.0 + 0.15)

    # 2. Completeness — length-bucketed (heuristic)
    if words < 20:
        completeness = 0.3
    elif words < 80:
        completeness = 0.6
    elif words < 400:
        completeness = 0.9
    else:
        completeness = 0.75  # penalize excessive length

    # 3. Coherence — sentence count and average length
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", resp) if s.strip()]
    avg_len = (words / len(sentences)) if sentences else 0
    coherence = 1.0 if 8 <= avg_len <= 30 else (0.7 if 5 <= avg_len <= 40 else 0.4)

    # 4. Accuracy — presence of verifiable citations
    accuracy = 0.5
    if req.citations:
        covered = 0
        for c in req.citations:
            ct = _tokens(c.content)
            if ct and _jaccard(ct, r_tokens) > 0.1:
                covered += 1
        accuracy = 0.3 + 0.7 * (covered / max(1, len(req.citations)))

    # 5. Helpfulness — presence of structure (lists, code, questions addressed)
    helpful = 0.5
    if re.search(r"^[\-*]\s", resp, re.MULTILINE) or re.search(r"^\d+[.)]\s", resp, re.MULTILINE):
        helpful += 0.2
    if "```" in resp or re.search(r"^\s{4}", resp, re.MULTILINE):
        helpful += 0.2
    if re.search(r"\?$", req.query.strip()):
        if len(resp) > 30:
            helpful += 0.1
    helpful = min(1.0, helpful)

    # 6. Safety — heuristic: look for a few risk signals (very shallow)
    safety = 1.0
    for pattern in (r"(?i)\bpassword\b.*\bis\b", r"(?i)api[_ ]?key", r"(?i)ignore previous"):
        if re.search(pattern, resp):
            safety -= 0.3
    safety = max(0.0, safety)

    dims = {
        "relevance":    DimensionScore(score=round(relevance, 3), reason=f"query/response token overlap {rel_overlap:.2f}"),
        "completeness": DimensionScore(score=round(completeness, 3), reason=f"{words} words"),
        "coherence":    DimensionScore(score=round(coherence, 3),    reason=f"avg {avg_len:.1f} words/sentence, {len(sentences)} sentences"),
        "accuracy":     DimensionScore(score=round(accuracy, 3),     reason=f"{len(req.citations)} citations supplied"),
        "helpfulness":  DimensionScore(score=round(helpful, 3),      reason="structure heuristics"),
        "safety":       DimensionScore(score=round(safety, 3),       reason="risk-pattern scan"),
    }
    weights = {"relevance": 0.25, "completeness": 0.15, "coherence": 0.15,
               "accuracy": 0.20, "helpfulness": 0.15, "safety": 0.10}
    overall = round(sum(weights[k] * dims[k].score for k in weights), 3)
    # Confidence — lower when response is very short or no citations
    confidence = 0.6
    if words >= 50 and req.citations: confidence = 0.85
    if words < 20: confidence = 0.35

    warnings: list[str] = []
    if safety < 1.0: warnings.append("Potential safety concern detected (heuristic)")
    if not req.citations: warnings.append("No citations provided — accuracy cannot be strongly verified")
    if words < 10: warnings.append("Response is very short")

    _quality_score.observe(overall)
    for dname, ds in dims.items():
        _dimension_score.labels(dimension=dname).observe(ds.score)
    for w in warnings:
        kind = "safety" if "safety" in w.lower() else ("no_citations" if "citations" in w.lower() else ("short" if "short" in w.lower() else "other"))
        _quality_warnings.labels(kind=kind).inc()
    return QualityResponse(overall=overall, confidence=round(confidence, 3), dimensions=dims, warnings=warnings)


class VerifyRequest(BaseModel):
    response: str
    citations: List[Citation]


class ClaimCheck(BaseModel):
    sentence: str
    supported: bool
    best_match_score: float
    best_match_source: Optional[str]


class VerifyResponse(BaseModel):
    overall_supported_ratio: float
    claims: List[ClaimCheck]
    unsupported_count: int


@router.post("/verify-citations", response_model=VerifyResponse)
async def verify_citations(req: VerifyRequest) -> VerifyResponse:
    """
    Split the response into sentences. For each sentence with claim-like content,
    compute Jaccard overlap against each citation. Flag unsupported if top score < 0.15.
    """
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", req.response) if len(s.strip()) > 15]
    checks: list[ClaimCheck] = []
    cit_tokens = [(c, _tokens(c.content)) for c in req.citations]

    for sent in sentences:
        st = _tokens(sent)
        if len(st) < 3:
            continue
        best_score = 0.0
        best_src = None
        for c, ct in cit_tokens:
            j = _jaccard(st, ct)
            if j > best_score:
                best_score = j
                best_src = c.document_name or "(citation)"
        supported = best_score >= 0.15
        checks.append(ClaimCheck(
            sentence=sent[:300],
            supported=supported,
            best_match_score=round(best_score, 3),
            best_match_source=best_src,
        ))
    if not checks:
        return VerifyResponse(overall_supported_ratio=1.0, claims=[], unsupported_count=0)
    supported_ratio = sum(1 for c in checks if c.supported) / len(checks)
    unsupported = sum(1 for c in checks if not c.supported)
    _citation_ratio.observe(supported_ratio)
    if unsupported > 0:
        _citation_unsupported.inc(unsupported)
    return VerifyResponse(overall_supported_ratio=round(supported_ratio, 3), claims=checks, unsupported_count=unsupported)

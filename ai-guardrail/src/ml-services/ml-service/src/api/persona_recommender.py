"""
Persona auto-selection based on query intent/domain analysis.

Keyword-based heuristic. Returns ranked persona recommendations with confidence.
"""
from __future__ import annotations

import re
from typing import List

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/persona", tags=["persona"])

# Domain → persona mapping with weighted keywords
_DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "security":    ["vulnerability", "cve", "threat", "attack", "firewall", "encryption", "malware", "breach", "phishing", "intrusion", "penetration", "zero-day", "siem", "soc", "incident"],
    "engineering": ["code", "bug", "deploy", "kubernetes", "docker", "api", "database", "sql", "git", "ci/cd", "pipeline", "refactor", "architecture", "microservice", "debug", "stack trace", "terraform"],
    "legal":       ["contract", "clause", "liability", "compliance", "regulation", "gdpr", "hipaa", "soc2", "nda", "terms", "privacy policy", "agreement", "intellectual property", "patent"],
    "finance":     ["revenue", "cost", "budget", "roi", "margin", "forecast", "quarterly", "invoice", "payment", "subscription", "pricing", "financial", "accounting", "profit"],
    "hr":          ["employee", "hiring", "onboarding", "benefits", "salary", "performance review", "leave", "policy", "handbook", "interview", "recruitment", "termination"],
    "data":        ["dataset", "model", "training", "accuracy", "precision", "recall", "clustering", "regression", "neural", "deep learning", "analytics", "visualization", "dashboard", "statistics", "metric"],
    "marketing":   ["campaign", "brand", "audience", "conversion", "seo", "content", "social media", "engagement", "funnel", "lead", "advertisement", "copy", "messaging"],
    "operations":  ["process", "workflow", "efficiency", "automation", "sla", "runbook", "incident", "on-call", "monitoring", "alert", "capacity", "scaling"],
    "research":    ["paper", "study", "literature", "citation", "peer review", "hypothesis", "methodology", "findings", "abstract", "journal", "reference"],
    "creative":    ["write", "draft", "story", "blog", "article", "copywriting", "tone", "narrative", "headline", "tagline"],
    "support":     ["customer", "ticket", "issue", "resolution", "escalation", "feedback", "satisfaction", "response time", "help desk", "support"],
    "general":     [],
}

_PERSONA_MAP = {
    "security":    "security",
    "engineering": "engineering",
    "legal":       "legal",
    "finance":     "finance",
    "hr":          "hr",
    "data":        "data",
    "marketing":   "marketing",
    "operations":  "operations",
    "research":    "research",
    "creative":    "creative",
    "support":     "support",
    "general":     "general",
}


class RecommendRequest(BaseModel):
    query: str
    available_personas: List[str] = Field(default_factory=list, description="If provided, only recommend from this set")


class PersonaScore(BaseModel):
    persona_id: str
    domain: str
    score: float
    matched_keywords: List[str]


class RecommendResponse(BaseModel):
    recommendations: List[PersonaScore]
    top_pick: str
    confidence: float


@router.post("/recommend", response_model=RecommendResponse)
async def recommend_persona(req: RecommendRequest) -> RecommendResponse:
    q_lower = req.query.lower()
    scores: dict[str, tuple[float, list[str]]] = {}

    for domain, keywords in _DOMAIN_KEYWORDS.items():
        matched = [kw for kw in keywords if kw in q_lower]
        score = len(matched) / max(1, len(keywords)) if keywords else 0.0
        # Boost if multiple matches
        if len(matched) >= 3:
            score = min(1.0, score * 1.5)
        scores[domain] = (round(score, 3), matched)

    # Filter to available personas if provided
    available = set(req.available_personas) if req.available_personas else set(_PERSONA_MAP.values())

    recs: list[PersonaScore] = []
    for domain, (score, matched) in scores.items():
        pid = _PERSONA_MAP.get(domain, domain)
        if pid not in available:
            continue
        if score > 0 or domain == "general":
            recs.append(PersonaScore(persona_id=pid, domain=domain, score=score, matched_keywords=matched))

    recs.sort(key=lambda r: r.score, reverse=True)

    # Always include general as fallback
    if not any(r.persona_id == "general" for r in recs):
        recs.append(PersonaScore(persona_id="general", domain="general", score=0.1, matched_keywords=[]))

    top = recs[0] if recs else PersonaScore(persona_id="general", domain="general", score=0.1, matched_keywords=[])
    confidence = min(0.95, top.score + 0.3) if top.score > 0 else 0.3

    return RecommendResponse(
        recommendations=recs[:5],
        top_pick=top.persona_id,
        confidence=round(confidence, 3),
    )

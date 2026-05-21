"""
Prompt injection detection — Layer 3 (semantic analysis).

Extends existing L1 (regex) + L2 (ML classifier) with semantic pattern detection:
  - Role-play manipulation ("pretend you are", "act as", "you are now")
  - Instruction override ("ignore previous", "disregard", "forget your instructions")
  - Context manipulation ("system prompt says", "your real instructions")
  - Jailbreak patterns ("DAN", "developer mode", "do anything now")
  - Output format manipulation ("respond only with", "base64 encode")

Returns per-pattern scores + aggregate risk.
"""
from __future__ import annotations

import re
from typing import List

from fastapi import APIRouter
from pydantic import BaseModel, Field
from prometheus_client import Counter

router = APIRouter(prefix="/v1/injection", tags=["injection-detection"])

_injection_total = Counter("kyra_injection_detections_total", "Injection detections", labelnames=("category", "severity"))

# Pattern categories with weighted regex rules
_PATTERNS: list[tuple[str, str, str, float]] = [
    # (category, severity, pattern, weight)
    # Role-play manipulation
    ("role_play", "HIGH", r"(?i)(pretend|act as if|you are now|imagine you|roleplay|assume the role|from now on you)", 0.8),
    ("role_play", "MEDIUM", r"(?i)(be my|you.?re a|play the part|character|persona).*(?:ignore|bypass|override)", 0.6),
    # Instruction override
    ("instruction_override", "CRITICAL", r"(?i)(ignore|disregard|forget|override|bypass).{0,30}(previous|above|prior|system|instruction|rule|guardrail|safety)", 0.95),
    ("instruction_override", "HIGH", r"(?i)(new instruction|updated rule|admin override|maintenance mode|debug mode)", 0.8),
    ("instruction_override", "CRITICAL", r"(?i)(do not follow|stop following|cancel).{0,20}(instruction|guideline|policy|rule)", 0.9),
    # Context manipulation
    ("context_manipulation", "CRITICAL", r"(?i)(system prompt|hidden instruction|real instruction|actual instruction|true purpose|secret.*instruction)", 0.9),
    ("context_manipulation", "HIGH", r"(?i)(reveal|show|tell me|what is).{0,20}(system prompt|instruction|training|configuration)", 0.75),
    # Jailbreak
    ("jailbreak", "CRITICAL", r"(?i)(DAN|do anything now|jailbreak|developer mode|god mode|unrestricted mode|evil mode)", 0.95),
    ("jailbreak", "HIGH", r"(?i)(hypothetical|fictional|thought experiment).{0,30}(harmful|illegal|dangerous|unethical)", 0.7),
    ("jailbreak", "MEDIUM", r"(?i)(for (educational|research|academic) purposes).{0,30}(hack|exploit|attack|bypass)", 0.5),
    # Output format manipulation
    ("output_manipulation", "MEDIUM", r"(?i)(respond only|output only|reply only|answer only).{0,20}(yes|no|true|false|json|code|base64)", 0.4),
    ("output_manipulation", "HIGH", r"(?i)(encode|encrypt|obfuscate|base64|hex|rot13).{0,20}(response|answer|output)", 0.6),
    # Data exfiltration
    ("data_exfil", "HIGH", r"(?i)(repeat|echo|copy|print).{0,20}(everything|all|entire|full).{0,20}(above|conversation|history|context|prompt)", 0.8),
    ("data_exfil", "CRITICAL", r"(?i)(send|post|email|upload|transfer).{0,30}(conversation|data|information|context).{0,20}(to|at|@)", 0.85),
]


class DetectionHit(BaseModel):
    category: str
    severity: str
    pattern_snippet: str
    weight: float


class DetectionRequest(BaseModel):
    content: str
    threshold: float = Field(0.3, description="Min weight to report a hit")


class DetectionResponse(BaseModel):
    is_injection: bool
    risk_score: float                  # 0.0 – 1.0
    confidence: float
    hits: List[DetectionHit]
    recommendation: str               # ALLOW | WARN | BLOCK


@router.post("/detect", response_model=DetectionResponse)
async def detect_injection(req: DetectionRequest) -> DetectionResponse:
    hits: list[DetectionHit] = []
    max_weight = 0.0

    for category, severity, pattern, weight in _PATTERNS:
        if weight < req.threshold:
            continue
        m = re.search(pattern, req.content)
        if m:
            hits.append(DetectionHit(
                category=category,
                severity=severity,
                pattern_snippet=m.group(0)[:80],
                weight=round(weight, 3),
            ))
            if weight > max_weight:
                max_weight = weight
            _injection_total.labels(category=category, severity=severity).inc()

    risk_score = min(1.0, sum(h.weight for h in hits))
    confidence = min(0.95, 0.3 + len(hits) * 0.15)

    if risk_score >= 0.8:
        recommendation = "BLOCK"
    elif risk_score >= 0.4:
        recommendation = "WARN"
    else:
        recommendation = "ALLOW"

    return DetectionResponse(
        is_injection=risk_score >= 0.4,
        risk_score=round(risk_score, 3),
        confidence=round(confidence, 3),
        hits=hits,
        recommendation=recommendation,
    )

"""Pydantic models for security detection endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Prompt Injection
# ---------------------------------------------------------------------------


class InjectionScanRequest(BaseModel):
    """Request body for prompt-injection scanning."""

    text: str
    context: str | None = None


class MatchedPattern(BaseModel):
    """A single regex pattern that matched during injection scanning."""

    pattern_name: str
    category: str
    matched_text: str


class InjectionResult(BaseModel):
    """Result of prompt-injection classification."""

    detected: bool
    confidence: float = Field(ge=0.0, le=1.0)
    threat_level: Literal["none", "low", "medium", "high", "critical"]
    injection_type: str = "none"
    matched_patterns: list[MatchedPattern] = Field(default_factory=list)
    details: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# PII Detection
# ---------------------------------------------------------------------------


class PIIScanRequest(BaseModel):
    """Request body for PII detection."""

    text: str
    redact: bool = False


class PIIDetection(BaseModel):
    """A single PII detection span."""

    type: str
    value: str
    start: int
    end: int
    confidence: float = Field(ge=0.0, le=1.0)
    category: Literal["pii", "financial", "credential", "healthcare"]


class PIIDetectionResult(BaseModel):
    """Aggregated PII detection result."""

    found: bool
    detections: list[PIIDetection] = Field(default_factory=list)
    risk_score: float = Field(ge=0.0, le=100.0)
    redacted_text: str | None = None


# ---------------------------------------------------------------------------
# Anomaly Detection
# ---------------------------------------------------------------------------


class AnomalyScanRequest(BaseModel):
    """Request body for behavioural anomaly checks."""

    user_id: str
    request_data: dict
    history: list[dict] = Field(default_factory=list)


class AnomalyFactor(BaseModel):
    """One contributing factor to an anomaly score."""

    name: str
    score: float = Field(ge=0.0, le=1.0)
    weight: float = Field(ge=0.0, le=1.0)
    description: str


class AnomalyResult(BaseModel):
    """Aggregated anomaly detection result."""

    is_anomalous: bool
    risk_score: float = Field(ge=0.0, le=100.0)
    factors: list[AnomalyFactor] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Data Classification
# ---------------------------------------------------------------------------


class ClassificationRequest(BaseModel):
    """Request body for data sensitivity classification."""

    text: str


class ClassificationResult(BaseModel):
    """Data sensitivity classification result."""

    level: Literal["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "TOP_SECRET"]
    confidence: float = Field(ge=0.0, le=1.0)
    reasons: list[str] = Field(default_factory=list)
    pii_density: float = Field(ge=0.0, le=1.0)
    regulated_data_types: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Comprehensive Scan
# ---------------------------------------------------------------------------


class ComprehensiveScanRequest(BaseModel):
    """Request body for running all security checks at once."""

    text: str
    user_id: str | None = None
    context: str | None = None


class ComprehensiveScanResult(BaseModel):
    """Combined result from all security modules."""

    injection: InjectionResult
    pii: PIIDetectionResult
    anomaly: AnomalyResult | None = None
    classification: ClassificationResult
    overall_risk_score: float = Field(ge=0.0, le=100.0)
    recommendation: Literal["allow", "flag", "block"]

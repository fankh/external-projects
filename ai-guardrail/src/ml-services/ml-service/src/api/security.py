"""Security detection API endpoints."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException

from src.models.security_schemas import (
    AnomalyResult,
    AnomalyScanRequest,
    ClassificationRequest,
    ClassificationResult,
    ComprehensiveScanRequest,
    ComprehensiveScanResult,
    InjectionResult,
    InjectionScanRequest,
    PIIDetectionResult,
    PIIScanRequest,
)
from src.services.anomaly_detector import AnomalyDetector
from src.services.data_classifier import DataClassifier
from src.services.ner_pii_detector import NERPIIDetector
from src.services.prompt_injection_classifier import PromptInjectionClassifier

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/security", tags=["security"])

# -- singleton service instances (created on first use) ---------------------

_injection_classifier: PromptInjectionClassifier | None = None
_pii_detector: NERPIIDetector | None = None
_anomaly_detector: AnomalyDetector | None = None
_data_classifier: DataClassifier | None = None


def _get_injection_classifier() -> PromptInjectionClassifier:
    global _injection_classifier
    if _injection_classifier is None:
        _injection_classifier = PromptInjectionClassifier()
    return _injection_classifier


def _get_pii_detector() -> NERPIIDetector:
    global _pii_detector
    if _pii_detector is None:
        _pii_detector = NERPIIDetector()
    return _pii_detector


def _get_anomaly_detector() -> AnomalyDetector:
    global _anomaly_detector
    if _anomaly_detector is None:
        _anomaly_detector = AnomalyDetector()
    return _anomaly_detector


def _get_data_classifier() -> DataClassifier:
    global _data_classifier
    if _data_classifier is None:
        _data_classifier = DataClassifier()
    return _data_classifier


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/scan-injection", response_model=InjectionResult)
async def scan_injection(body: InjectionScanRequest) -> InjectionResult:
    """Run three-layer prompt injection detection."""
    try:
        classifier = _get_injection_classifier()
        return await classifier.classify(body.text, context=body.context)
    except Exception as exc:
        logger.exception("Injection scan failed")
        raise HTTPException(status_code=500, detail=f"Injection scan error: {exc}")


@router.post("/detect-pii", response_model=PIIDetectionResult)
async def detect_pii(body: PIIScanRequest) -> PIIDetectionResult:
    """Detect PII with optional redaction."""
    try:
        detector = _get_pii_detector()
        result = await detector.detect(body.text)
        if body.redact:
            redacted = await detector.redact(body.text, result.detections)
            result.redacted_text = redacted
        return result
    except Exception as exc:
        logger.exception("PII detection failed")
        raise HTTPException(status_code=500, detail=f"PII detection error: {exc}")


@router.post("/check-anomaly", response_model=AnomalyResult)
async def check_anomaly(body: AnomalyScanRequest) -> AnomalyResult:
    """Behavioural anomaly detection."""
    try:
        detector = _get_anomaly_detector()
        return await detector.detect_anomalies(
            user_id=body.user_id,
            current_request=body.request_data,
            history=body.history,
        )
    except Exception as exc:
        logger.exception("Anomaly check failed")
        raise HTTPException(status_code=500, detail=f"Anomaly check error: {exc}")


@router.post("/classify", response_model=ClassificationResult)
async def classify_data(body: ClassificationRequest) -> ClassificationResult:
    """Data sensitivity classification."""
    try:
        classifier = _get_data_classifier()
        return await classifier.classify(body.text)
    except Exception as exc:
        logger.exception("Classification failed")
        raise HTTPException(status_code=500, detail=f"Classification error: {exc}")


@router.post("/comprehensive-scan", response_model=ComprehensiveScanResult)
async def comprehensive_scan(body: ComprehensiveScanRequest) -> ComprehensiveScanResult:
    """Run all security checks in parallel and return combined result."""
    try:
        injection_classifier = _get_injection_classifier()
        pii_detector = _get_pii_detector()
        anomaly_detector = _get_anomaly_detector()
        data_classifier = _get_data_classifier()

        # Build tasks
        injection_task = injection_classifier.classify(body.text, context=body.context)
        pii_task = pii_detector.detect(body.text)
        classification_task = data_classifier.classify(body.text)

        # Anomaly check is optional (requires user_id)
        anomaly_task = None
        if body.user_id:
            anomaly_task = anomaly_detector.detect_anomalies(
                user_id=body.user_id,
                current_request={"text": body.text, "context": body.context},
                history=[],
            )

        # Run in parallel
        if anomaly_task:
            injection_result, pii_result, classification_result, anomaly_result = (
                await asyncio.gather(
                    injection_task, pii_task, classification_task, anomaly_task,
                )
            )
        else:
            injection_result, pii_result, classification_result = await asyncio.gather(
                injection_task, pii_task, classification_task,
            )
            anomaly_result = None

        # Compute overall risk
        scores = [
            injection_result.confidence * 100,
            pii_result.risk_score,
        ]
        if anomaly_result:
            scores.append(anomaly_result.risk_score)

        # Map classification level to a risk contribution
        level_risk = {
            "PUBLIC": 0, "INTERNAL": 10, "CONFIDENTIAL": 30,
            "RESTRICTED": 60, "TOP_SECRET": 90,
        }
        scores.append(float(level_risk.get(classification_result.level, 0)))

        overall_risk = min(100.0, round(max(scores), 2))

        if overall_risk >= 70:
            recommendation = "block"
        elif overall_risk >= 40:
            recommendation = "flag"
        else:
            recommendation = "allow"

        return ComprehensiveScanResult(
            injection=injection_result,
            pii=pii_result,
            anomaly=anomaly_result,
            classification=classification_result,
            overall_risk_score=overall_risk,
            recommendation=recommendation,  # type: ignore[arg-type]
        )
    except Exception as exc:
        logger.exception("Comprehensive scan failed")
        raise HTTPException(status_code=500, detail=f"Comprehensive scan error: {exc}")

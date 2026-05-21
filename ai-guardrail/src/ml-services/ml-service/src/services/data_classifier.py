"""Data sensitivity classifier using markers, PII density, and regulatory checks."""

from __future__ import annotations

import logging
import re
from typing import Literal

from src.models.security_schemas import ClassificationResult
from src.services.ner_pii_detector import NERPIIDetector

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sensitivity markers
# ---------------------------------------------------------------------------

_SENSITIVITY_MARKERS: dict[str, str] = {
    # marker regex -> classification level
    r"\bTOP\s*SECRET\b": "TOP_SECRET",
    r"\bTS//SCI\b": "TOP_SECRET",
    r"\bRESTRICTED\b": "RESTRICTED",
    r"\bCONFIDENTIAL\b": "CONFIDENTIAL",
    r"\bINTERNAL\s*(USE\s*)?ONLY\b": "INTERNAL",
    r"\bPROPRIETARY\b": "CONFIDENTIAL",
    r"\bSENSITIVE\b": "CONFIDENTIAL",
    r"\bCLASSIFIED\b": "RESTRICTED",
    r"\bNOT\s+FOR\s+(PUBLIC\s+)?DISTRIBUTION\b": "INTERNAL",
    r"\bNOFORN\b": "TOP_SECRET",
    r"\bFOR\s+OFFICIAL\s+USE\s+ONLY\b": "RESTRICTED",
    r"\bLAW\s+ENFORCEMENT\s+SENSITIVE\b": "RESTRICTED",
}

_COMPILED_MARKERS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(pat, re.IGNORECASE), level)
    for pat, level in _SENSITIVITY_MARKERS.items()
]

# ---------------------------------------------------------------------------
# Regulatory data patterns
# ---------------------------------------------------------------------------

_REGULATORY_PATTERNS: dict[str, list[tuple[str, re.Pattern[str]]]] = {
    "HIPAA": [
        ("phi_indicator", re.compile(r"\b(patient|diagnosis|treatment|medical\s+record|prescription|ICD[\s-]?\d{1,2}|CPT|HIPAA|protected\s+health)\b", re.IGNORECASE)),
        ("health_id", re.compile(r"\bMRN\s*[#:\-]?\s*\d{6,10}\b", re.IGNORECASE)),
    ],
    "PCI-DSS": [
        ("card_data", re.compile(r"\b(cardholder|card\s*number|CVV|CVC|expiration\s+date|PAN|PCI[\s-]?DSS|payment\s+card)\b", re.IGNORECASE)),
        ("card_number", re.compile(r"\b[3-6]\d{3}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{3,4}\b")),
    ],
    "GDPR": [
        ("gdpr_data", re.compile(r"\b(GDPR|personal\s+data|data\s+subject|right\s+to\s+erasure|data\s+processor|data\s+controller|consent|EU\s+citizen)\b", re.IGNORECASE)),
        ("eu_id", re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b")),  # IBAN
    ],
    "SOX": [
        ("financial_report", re.compile(r"\b(SOX|Sarbanes[\s-]?Oxley|financial\s+statement|audit|internal\s+controls?|10[\s-]?[KQ])\b", re.IGNORECASE)),
    ],
    "FERPA": [
        ("education_record", re.compile(r"\b(FERPA|student\s+record|transcript|GPA|enrollment|education\s+record)\b", re.IGNORECASE)),
    ],
}

# ---------------------------------------------------------------------------
# Classification level ordering
# ---------------------------------------------------------------------------

_LEVEL_ORDER: dict[str, int] = {
    "PUBLIC": 0,
    "INTERNAL": 1,
    "CONFIDENTIAL": 2,
    "RESTRICTED": 3,
    "TOP_SECRET": 4,
}


def _max_level(a: str, b: str) -> str:
    return a if _LEVEL_ORDER.get(a, 0) >= _LEVEL_ORDER.get(b, 0) else b


# ---------------------------------------------------------------------------
# Classifier
# ---------------------------------------------------------------------------


class DataClassifier:
    """Assigns sensitivity classification to arbitrary text."""

    def __init__(self) -> None:
        self._pii_detector = NERPIIDetector()

    async def classify(self, text: str) -> ClassificationResult:
        """Run all classification heuristics and return a result."""
        level: str = "PUBLIC"
        reasons: list[str] = []
        regulated_types: list[str] = []

        # 1. Check explicit sensitivity markers
        for regex, marker_level in _COMPILED_MARKERS:
            if regex.search(text):
                level = _max_level(level, marker_level)
                reasons.append(f"Sensitivity marker found: {marker_level}")

        # 2. Check PII density
        pii_result = await self._pii_detector.detect(text)
        word_count = max(len(text.split()), 1)
        pii_density = len(pii_result.detections) / word_count
        pii_density = min(1.0, pii_density)

        if pii_density > 0.05:
            level = _max_level(level, "RESTRICTED")
            reasons.append(f"High PII density: {pii_density:.3f}")
        elif pii_density > 0.02:
            level = _max_level(level, "CONFIDENTIAL")
            reasons.append(f"Moderate PII density: {pii_density:.3f}")
        elif pii_density > 0.005:
            level = _max_level(level, "INTERNAL")
            reasons.append(f"Low PII density: {pii_density:.3f}")

        # Credential detections always bump to at least CONFIDENTIAL
        credential_dets = [d for d in pii_result.detections if d.category == "credential"]
        if credential_dets:
            level = _max_level(level, "CONFIDENTIAL")
            reasons.append(f"Credentials detected: {len(credential_dets)}")

        # 3. Check regulated data patterns
        for reg_type, patterns in _REGULATORY_PATTERNS.items():
            for pattern_name, regex in patterns:
                if regex.search(text):
                    regulated_types.append(reg_type)
                    reasons.append(f"Regulated data pattern ({reg_type}): {pattern_name}")
                    break  # one match per regulation type is enough

        if "HIPAA" in regulated_types:
            level = _max_level(level, "RESTRICTED")
        if "PCI-DSS" in regulated_types:
            level = _max_level(level, "CONFIDENTIAL")
        if "GDPR" in regulated_types:
            level = _max_level(level, "CONFIDENTIAL")

        # 4. Compute confidence
        confidence = self._compute_confidence(level, reasons)

        return ClassificationResult(
            level=level,  # type: ignore[arg-type]
            confidence=round(confidence, 4),
            reasons=reasons,
            pii_density=round(pii_density, 6),
            regulated_data_types=sorted(set(regulated_types)),
        )

    @staticmethod
    def _compute_confidence(level: str, reasons: list[str]) -> float:
        """Higher confidence when multiple signals agree."""
        if level == "PUBLIC":
            return 0.95 if not reasons else 0.8
        n = len(reasons)
        base = 0.6
        return min(1.0, base + n * 0.1)

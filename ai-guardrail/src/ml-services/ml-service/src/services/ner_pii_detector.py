"""NER / regex PII detector with optional spaCy backend."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from src.models.security_schemas import PIIDetection, PIIDetectionResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Attempt to load spaCy (graceful fallback)
# ---------------------------------------------------------------------------

_nlp = None
try:
    import spacy

    try:
        _nlp = spacy.load("en_core_web_sm")
        logger.info("spaCy model 'en_core_web_sm' loaded for NER-based PII detection")
    except OSError:
        logger.info("spaCy available but model 'en_core_web_sm' not installed -- NER disabled")
except ImportError:
    logger.info("spaCy not installed -- NER-based PII detection disabled")


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class _PIIPattern:
    name: str
    regex: re.Pattern[str]
    category: str  # pii | financial | credential | healthcare
    confidence: float


def _p(name: str, pattern: str, category: str, confidence: float = 0.9) -> _PIIPattern:
    return _PIIPattern(name, re.compile(pattern, re.IGNORECASE), category, confidence)


_PATTERNS: list[_PIIPattern] = [
    # --- PII ---
    _p("ssn", r"\b\d{3}-\d{2}-\d{4}\b", "pii"),
    _p("ssn_no_dash", r"\b(?<!\d)\d{9}(?!\d)\b", "pii", 0.6),
    _p("email", r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b", "pii", 0.95),
    _p("phone_us", r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b", "pii", 0.8),
    _p("phone_intl", r"\b\+\d{1,3}[-.\s]?\d{4,14}\b", "pii", 0.75),
    _p("date_of_birth", r"\b(?:DOB|date\s+of\s+birth|born)\s*[:\-]?\s*\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b", "pii"),
    _p("passport", r"\b[A-Z]{1,2}\d{6,9}\b", "pii", 0.5),
    _p("ip_address", r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "pii", 0.6),
    _p("ipv6_address", r"\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b", "pii", 0.6),

    # --- Financial ---
    _p("credit_card_visa", r"\b4\d{3}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b", "financial"),
    _p("credit_card_mc", r"\b5[1-5]\d{2}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b", "financial"),
    _p("credit_card_amex", r"\b3[47]\d{2}[-\s]?\d{6}[-\s]?\d{5}\b", "financial"),
    _p("credit_card_discover", r"\b6(?:011|5\d{2})[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b", "financial"),
    _p("bank_account", r"\b\d{8,17}\b", "financial", 0.3),  # broad -- low confidence
    _p("routing_number", r"\b\d{9}\b", "financial", 0.3),
    _p("iban", r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b", "financial", 0.85),

    # --- Credentials ---
    _p("aws_access_key", r"\bAKIA[0-9A-Z]{16}\b", "credential"),
    _p("aws_secret_key", r"\b[A-Za-z0-9/+=]{40}\b", "credential", 0.4),
    _p("private_key_header", r"-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----", "credential"),
    _p("jwt", r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b", "credential"),
    _p("generic_api_key", r"\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token)\s*[=:]\s*['\"]?[A-Za-z0-9\-_.]{20,}['\"]?", "credential", 0.8),
    _p("github_token", r"\bgh[ps]_[A-Za-z0-9]{36,}\b", "credential"),
    _p("slack_token", r"\bxox[baprs]-[A-Za-z0-9\-]{10,}\b", "credential"),

    # --- Healthcare ---
    _p("medical_record", r"\b(?:MRN|medical\s+record)\s*[#:\-]?\s*\d{6,10}\b", "healthcare"),
    _p("npi", r"\b\d{10}\b", "healthcare", 0.3),
    _p("icd_code", r"\b[A-Z]\d{2}(?:\.\d{1,4})?\b", "healthcare", 0.4),
    _p("drug_dea", r"\b[A-Z]{2}\d{7}\b", "healthcare", 0.4),
]


# ---------------------------------------------------------------------------
# Luhn check for credit card validation
# ---------------------------------------------------------------------------


def _luhn_check(number: str) -> bool:
    digits = [int(d) for d in number if d.isdigit()]
    if len(digits) < 13 or len(digits) > 19:
        return False
    checksum = 0
    reverse = digits[::-1]
    for i, d in enumerate(reverse):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------


class NERPIIDetector:
    """Regex + optional spaCy NER PII detector."""

    def __init__(self) -> None:
        self._nlp = _nlp

    # -- public API ---------------------------------------------------------

    async def detect(self, text: str) -> PIIDetectionResult:
        """Run all detection layers and return aggregated result."""
        detections: list[PIIDetection] = []

        # 1. Regex-based detection
        detections.extend(self._regex_detect(text))

        # 2. NER-based detection (if spaCy available)
        if self._nlp is not None:
            detections.extend(self._ner_detect(text))

        # 3. Deduplicate overlapping spans
        detections = self._deduplicate(detections)

        risk_score = self._compute_risk(detections)

        return PIIDetectionResult(
            found=len(detections) > 0,
            detections=detections,
            risk_score=round(risk_score, 2),
            redacted_text=None,
        )

    async def redact(self, text: str, detections: list[PIIDetection]) -> str:
        """Replace detected PII with [REDACTED:TYPE] placeholders."""
        if not detections:
            return text

        # Sort by start position descending so replacements don't shift indices
        sorted_dets = sorted(detections, key=lambda d: d.start, reverse=True)
        result = text
        for det in sorted_dets:
            placeholder = f"[REDACTED:{det.type.upper()}]"
            result = result[:det.start] + placeholder + result[det.end:]
        return result

    # -- regex layer --------------------------------------------------------

    @staticmethod
    def _regex_detect(text: str) -> list[PIIDetection]:
        results: list[PIIDetection] = []
        for pat in _PATTERNS:
            for m in pat.regex.finditer(text):
                value = m.group()
                confidence = pat.confidence

                # Extra validation for credit cards
                if pat.name.startswith("credit_card"):
                    digits_only = re.sub(r"[\s\-]", "", value)
                    if not _luhn_check(digits_only):
                        continue
                    confidence = 0.95

                # Skip very short low-confidence matches
                if confidence < 0.5 and len(value) < 8:
                    continue

                results.append(PIIDetection(
                    type=pat.name,
                    value=value,
                    start=m.start(),
                    end=m.end(),
                    confidence=confidence,
                    category=pat.category,
                ))
        return results

    # -- NER layer ----------------------------------------------------------

    def _ner_detect(self, text: str) -> list[PIIDetection]:
        if self._nlp is None:
            return []

        results: list[PIIDetection] = []
        doc = self._nlp(text[:100_000])  # limit for performance

        _NER_MAP = {
            "PERSON": ("person_name", "pii", 0.85),
            "ORG": ("organisation", "pii", 0.7),
            "GPE": ("location", "pii", 0.6),
            "DATE": ("date", "pii", 0.5),
            "MONEY": ("monetary_value", "financial", 0.7),
        }

        for ent in doc.ents:
            if ent.label_ in _NER_MAP:
                pii_type, category, confidence = _NER_MAP[ent.label_]
                results.append(PIIDetection(
                    type=pii_type,
                    value=ent.text,
                    start=ent.start_char,
                    end=ent.end_char,
                    confidence=confidence,
                    category=category,
                ))

        return results

    # -- dedup & scoring ----------------------------------------------------

    @staticmethod
    def _deduplicate(detections: list[PIIDetection]) -> list[PIIDetection]:
        """Remove overlapping detections, keeping the one with higher confidence."""
        if len(detections) <= 1:
            return detections

        sorted_dets = sorted(detections, key=lambda d: (d.start, -d.confidence))
        result: list[PIIDetection] = []

        for det in sorted_dets:
            overlaps = False
            for existing in result:
                if det.start < existing.end and det.end > existing.start:
                    overlaps = True
                    break
            if not overlaps:
                result.append(det)

        return result

    @staticmethod
    def _compute_risk(detections: list[PIIDetection]) -> float:
        if not detections:
            return 0.0

        category_weights = {
            "credential": 30.0,
            "financial": 25.0,
            "healthcare": 20.0,
            "pii": 15.0,
        }

        score = 0.0
        for det in detections:
            weight = category_weights.get(det.category, 10.0)
            score += weight * det.confidence

        return min(100.0, score)

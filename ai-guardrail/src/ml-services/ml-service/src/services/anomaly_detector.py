"""Behavioural anomaly detector for user request patterns."""

from __future__ import annotations

import logging
import math
import statistics
from datetime import datetime, timezone

from src.models.security_schemas import AnomalyFactor, AnomalyResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Factor weights (must sum to ~1.0 for normalised scoring)
# ---------------------------------------------------------------------------

_WEIGHTS = {
    "request_frequency": 0.20,
    "off_hours_activity": 0.15,
    "content_length": 0.15,
    "new_identity": 0.15,
    "topic_switching": 0.20,
    "sensitive_topics": 0.15,
}

# ---------------------------------------------------------------------------
# Sensitive topic keywords
# ---------------------------------------------------------------------------

_SENSITIVE_TOPICS = {
    "weapons", "explosives", "drugs", "hacking", "exploit", "malware",
    "phishing", "ransomware", "attack", "vulnerability", "credentials",
    "password", "social security", "credit card", "bank account",
    "classified", "confidential", "top secret", "restricted",
    "suicide", "self-harm", "violence", "terrorism",
}


class AnomalyDetector:
    """Analyses user request patterns to detect behavioural anomalies."""

    async def detect_anomalies(
        self,
        user_id: str,
        current_request: dict,
        history: list[dict],
    ) -> AnomalyResult:
        """Score the current request against the user's history."""
        factors: list[AnomalyFactor] = []

        factors.append(self._check_frequency(history, current_request))
        factors.append(self._check_off_hours(current_request))
        factors.append(self._check_content_length(history, current_request))
        factors.append(self._check_new_identity(history, current_request))
        factors.append(self._check_topic_switching(history, current_request))
        factors.append(self._check_sensitive_topics(current_request))

        # Weighted risk score (0-100)
        risk_score = sum(f.score * f.weight * 100 for f in factors)
        risk_score = min(100.0, round(risk_score, 2))
        is_anomalous = risk_score >= 40.0

        return AnomalyResult(
            is_anomalous=is_anomalous,
            risk_score=risk_score,
            factors=factors,
        )

    # -- individual checks --------------------------------------------------

    @staticmethod
    def _check_frequency(
        history: list[dict], current: dict,
    ) -> AnomalyFactor:
        """Flag if request frequency is >3x the user's average."""
        name = "request_frequency"
        weight = _WEIGHTS[name]

        if len(history) < 3:
            return AnomalyFactor(
                name=name, score=0.0, weight=weight,
                description="Insufficient history to assess frequency",
            )

        # Extract timestamps
        timestamps: list[float] = []
        for h in history:
            ts = h.get("timestamp")
            if ts is not None:
                if isinstance(ts, (int, float)):
                    timestamps.append(float(ts))
                elif isinstance(ts, str):
                    try:
                        dt = datetime.fromisoformat(ts)
                        timestamps.append(dt.timestamp())
                    except ValueError:
                        pass

        if len(timestamps) < 3:
            return AnomalyFactor(
                name=name, score=0.0, weight=weight,
                description="Not enough timestamped history",
            )

        timestamps.sort()
        intervals = [
            timestamps[i + 1] - timestamps[i] for i in range(len(timestamps) - 1)
        ]
        avg_interval = statistics.mean(intervals)

        now_ts = current.get("timestamp")
        if now_ts is None:
            now_ts = datetime.now(timezone.utc).timestamp()
        elif isinstance(now_ts, str):
            now_ts = datetime.fromisoformat(now_ts).timestamp()

        current_interval = float(now_ts) - timestamps[-1]

        if avg_interval <= 0 or current_interval <= 0:
            return AnomalyFactor(
                name=name, score=0.0, weight=weight,
                description="Cannot compute interval ratio",
            )

        ratio = avg_interval / current_interval  # high ratio => much faster
        if ratio > 3.0:
            score = min(1.0, (ratio - 3.0) / 7.0 + 0.5)
            desc = f"Request rate {ratio:.1f}x faster than average"
        else:
            score = 0.0
            desc = "Request rate within normal range"

        return AnomalyFactor(name=name, score=score, weight=weight, description=desc)

    @staticmethod
    def _check_off_hours(current: dict) -> AnomalyFactor:
        """Flag activity outside 6 AM - 10 PM (user timezone or UTC)."""
        name = "off_hours_activity"
        weight = _WEIGHTS[name]

        ts = current.get("timestamp")
        tz_offset = current.get("timezone_offset", 0)  # hours from UTC

        if ts is None:
            now = datetime.now(timezone.utc)
        elif isinstance(ts, (int, float)):
            now = datetime.fromtimestamp(ts, tz=timezone.utc)
        elif isinstance(ts, str):
            try:
                now = datetime.fromisoformat(ts)
            except ValueError:
                now = datetime.now(timezone.utc)
        else:
            now = datetime.now(timezone.utc)

        local_hour = (now.hour + int(tz_offset)) % 24

        if 6 <= local_hour < 22:
            return AnomalyFactor(
                name=name, score=0.0, weight=weight,
                description=f"Activity at local hour {local_hour} is within normal hours",
            )

        # How far outside normal hours
        distance = min(abs(local_hour - 6), abs(local_hour - 22), abs(local_hour + 24 - 22))
        score = min(1.0, 0.4 + distance * 0.1)
        return AnomalyFactor(
            name=name, score=score, weight=weight,
            description=f"Activity at local hour {local_hour} is outside normal hours (6-22)",
        )

    @staticmethod
    def _check_content_length(
        history: list[dict], current: dict,
    ) -> AnomalyFactor:
        """Flag if content length is >3 std dev from the user's mean."""
        name = "content_length"
        weight = _WEIGHTS[name]

        current_text = current.get("text", current.get("content", ""))
        current_len = len(str(current_text))

        lengths = []
        for h in history:
            t = h.get("text", h.get("content", ""))
            lengths.append(len(str(t)))

        if len(lengths) < 3:
            return AnomalyFactor(
                name=name, score=0.0, weight=weight,
                description="Insufficient history to assess content length",
            )

        mean = statistics.mean(lengths)
        stdev = statistics.stdev(lengths) if len(lengths) > 1 else 1.0
        if stdev == 0:
            stdev = 1.0

        z_score = abs(current_len - mean) / stdev

        if z_score <= 3.0:
            return AnomalyFactor(
                name=name, score=0.0, weight=weight,
                description=f"Content length z-score {z_score:.1f} is within normal range",
            )

        score = min(1.0, (z_score - 3.0) / 5.0 + 0.4)
        return AnomalyFactor(
            name=name, score=score, weight=weight,
            description=f"Content length z-score {z_score:.1f} exceeds 3 std deviations",
        )

    @staticmethod
    def _check_new_identity(
        history: list[dict], current: dict,
    ) -> AnomalyFactor:
        """Flag new IP address or user agent."""
        name = "new_identity"
        weight = _WEIGHTS[name]

        current_ip = current.get("ip_address")
        current_ua = current.get("user_agent")

        if not current_ip and not current_ua:
            return AnomalyFactor(
                name=name, score=0.0, weight=weight,
                description="No identity metadata available",
            )

        known_ips = {h.get("ip_address") for h in history if h.get("ip_address")}
        known_uas = {h.get("user_agent") for h in history if h.get("user_agent")}

        new_flags: list[str] = []
        if current_ip and known_ips and current_ip not in known_ips:
            new_flags.append(f"new IP {current_ip}")
        if current_ua and known_uas and current_ua not in known_uas:
            new_flags.append("new user agent")

        if not new_flags:
            return AnomalyFactor(
                name=name, score=0.0, weight=weight,
                description="Identity matches known patterns",
            )

        score = min(1.0, 0.5 * len(new_flags))
        return AnomalyFactor(
            name=name, score=score, weight=weight,
            description=f"Detected: {', '.join(new_flags)}",
        )

    @staticmethod
    def _check_topic_switching(
        history: list[dict], current: dict,
    ) -> AnomalyFactor:
        """Flag rapid topic switching based on simple keyword overlap."""
        name = "topic_switching"
        weight = _WEIGHTS[name]

        def _keywords(text: str) -> set[str]:
            words = set(text.lower().split())
            # Filter common stop-words
            stops = {
                "the", "a", "an", "is", "are", "was", "were", "be", "been",
                "being", "have", "has", "had", "do", "does", "did", "will",
                "would", "could", "should", "may", "might", "must", "shall",
                "can", "to", "of", "in", "for", "on", "with", "at", "by",
                "from", "as", "into", "through", "during", "before", "after",
                "above", "below", "between", "this", "that", "these", "those",
                "i", "you", "he", "she", "it", "we", "they", "me", "my",
                "and", "or", "but", "not", "no", "if", "so", "than",
            }
            return words - stops

        current_text = str(current.get("text", current.get("content", "")))
        current_kw = _keywords(current_text)

        if not current_kw or len(history) < 2:
            return AnomalyFactor(
                name=name, score=0.0, weight=weight,
                description="Insufficient data for topic analysis",
            )

        # Compare against last 3 history entries
        recent = history[-3:]
        overlaps: list[float] = []
        for h in recent:
            h_text = str(h.get("text", h.get("content", "")))
            h_kw = _keywords(h_text)
            if h_kw:
                overlap = len(current_kw & h_kw) / max(len(current_kw | h_kw), 1)
                overlaps.append(overlap)

        if not overlaps:
            return AnomalyFactor(
                name=name, score=0.0, weight=weight,
                description="No comparable history",
            )

        avg_overlap = statistics.mean(overlaps)

        if avg_overlap >= 0.1:
            return AnomalyFactor(
                name=name, score=0.0, weight=weight,
                description=f"Topic overlap {avg_overlap:.2f} within normal range",
            )

        score = min(1.0, (0.1 - avg_overlap) * 10)
        return AnomalyFactor(
            name=name, score=score, weight=weight,
            description=f"Very low topic overlap ({avg_overlap:.2f}) suggests rapid switching",
        )

    @staticmethod
    def _check_sensitive_topics(current: dict) -> AnomalyFactor:
        """Flag requests touching sensitive topic keywords."""
        name = "sensitive_topics"
        weight = _WEIGHTS[name]

        text = str(current.get("text", current.get("content", ""))).lower()
        words = set(text.split())

        hits = _SENSITIVE_TOPICS & words
        if not hits:
            # Also check multi-word phrases
            for phrase in _SENSITIVE_TOPICS:
                if " " in phrase and phrase in text:
                    hits.add(phrase)

        if not hits:
            return AnomalyFactor(
                name=name, score=0.0, weight=weight,
                description="No sensitive topic keywords detected",
            )

        score = min(1.0, len(hits) * 0.3)
        return AnomalyFactor(
            name=name, score=score, weight=weight,
            description=f"Sensitive keywords detected: {', '.join(sorted(hits)[:5])}",
        )

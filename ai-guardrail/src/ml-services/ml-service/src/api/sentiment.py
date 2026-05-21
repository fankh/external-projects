"""
Conversation intelligence — sentiment analysis.

Lexicon-based heuristic. Returns per-message + aggregate sentiment.
Ships today; swap for a fine-tuned BERT classifier later.
"""
from __future__ import annotations

import re
from typing import List

from fastapi import APIRouter
from pydantic import BaseModel, Field
from prometheus_client import Counter

router = APIRouter(prefix="/v1/sentiment", tags=["sentiment"])

_sentiment_total = Counter("kyra_sentiment_total", "Sentiment detections", labelnames=("sentiment",))

# Simple lexicon
_POS = {"good","great","excellent","awesome","love","happy","wonderful","fantastic","helpful","clear","easy",
        "nice","perfect","thanks","thank","appreciate","agree","yes","correct","solved","resolved","works"}
_NEG = {"bad","terrible","awful","hate","angry","frustrated","confusing","wrong","broken","fail","error",
        "useless","disappointed","annoying","slow","bug","issue","problem","complaint","worse","horrible"}
_INTENSIFIERS = {"very","really","extremely","absolutely","totally","completely","incredibly","highly"}


class Message(BaseModel):
    role: str
    content: str


class SentimentRequest(BaseModel):
    messages: List[Message]


class MessageSentiment(BaseModel):
    role: str
    sentiment: str    # positive | negative | neutral | mixed
    score: float      # -1.0 to +1.0
    top_signals: List[str]


class SentimentResponse(BaseModel):
    messages: List[MessageSentiment]
    aggregate: str
    aggregate_score: float
    positive_ratio: float
    negative_ratio: float


@router.post("/analyze", response_model=SentimentResponse)
async def analyze_sentiment(req: SentimentRequest) -> SentimentResponse:
    results: list[MessageSentiment] = []
    total_score = 0.0

    for msg in req.messages:
        words = set(re.findall(r"\w+", msg.content.lower()))
        pos = words & _POS
        neg = words & _NEG
        intensified = bool(words & _INTENSIFIERS)
        boost = 1.3 if intensified else 1.0

        pos_score = len(pos) * 0.2 * boost
        neg_score = len(neg) * 0.2 * boost
        raw = min(1.0, pos_score) - min(1.0, neg_score)

        if raw > 0.15:
            label = "positive"
        elif raw < -0.15:
            label = "negative"
        elif pos and neg:
            label = "mixed"
        else:
            label = "neutral"

        signals = sorted(pos | neg)[:5]
        results.append(MessageSentiment(role=msg.role, sentiment=label, score=round(raw, 3), top_signals=signals))
        total_score += raw
        _sentiment_total.labels(sentiment=label).inc()

    n = max(1, len(results))
    agg_score = round(total_score / n, 3)
    agg = "positive" if agg_score > 0.15 else ("negative" if agg_score < -0.15 else "neutral")
    pos_ratio = sum(1 for r in results if r.sentiment == "positive") / n
    neg_ratio = sum(1 for r in results if r.sentiment == "negative") / n

    return SentimentResponse(
        messages=results,
        aggregate=agg,
        aggregate_score=agg_score,
        positive_ratio=round(pos_ratio, 3),
        negative_ratio=round(neg_ratio, 3),
    )

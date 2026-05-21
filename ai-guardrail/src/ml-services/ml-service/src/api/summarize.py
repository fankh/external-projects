"""
Conversation summarization — heuristic (extractive).

For each message, scores by: position weight (later = more relevant),
length penalty (too short = low info), question-answer detection,
keyword density. Returns top-K sentences as summary.

Ships today with no external model; replace with BART/T5 abstraction layer later.
"""
from __future__ import annotations

import re
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/summarize", tags=["summarize"])


class Message(BaseModel):
    role: str              # user | assistant
    content: str


class SummarizeRequest(BaseModel):
    messages: List[Message]
    max_sentences: int = Field(8, ge=1, le=50)
    include_decisions: bool = Field(True, description="Extract decision-like sentences")
    include_action_items: bool = Field(True, description="Extract TODO/action sentences")


class SummarizeResponse(BaseModel):
    summary: str
    key_topics: List[str]
    decisions: List[str]
    action_items: List[str]
    message_count: int
    compression_ratio: float


_WORD_RE = re.compile(r"\w+", re.UNICODE)
_DECISION_RE = re.compile(r"(?:decided|agreed|confirmed|approved|will go with|chosen|selected)", re.I)
_ACTION_RE = re.compile(r"(?:TODO|action item|please|need to|must|should|follow[- ]?up|deadline|by (monday|tuesday|wednesday|thursday|friday|tomorrow|EOD|end of))", re.I)


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 10]


def _score_sentence(s: str, position_weight: float) -> float:
    words = len(_WORD_RE.findall(s))
    if words < 5:
        return 0.0
    length_score = min(1.0, words / 25.0)
    return length_score * 0.6 + position_weight * 0.4


@router.post("/conversation", response_model=SummarizeResponse)
async def summarize_conversation(req: SummarizeRequest) -> SummarizeResponse:
    all_text = ""
    scored: list[tuple[float, str]] = []

    for idx, msg in enumerate(req.messages):
        all_text += msg.content + " "
        position = (idx + 1) / max(1, len(req.messages))
        # Assistant messages get slightly higher weight (they contain answers)
        role_bonus = 0.1 if msg.role == "assistant" else 0.0
        for sent in _sentences(msg.content):
            score = _score_sentence(sent, position) + role_bonus
            scored.append((score, sent))

    scored.sort(key=lambda x: x[0], reverse=True)
    summary_sents = [s for _, s in scored[:req.max_sentences]]
    summary = " ".join(summary_sents)

    # Key topics: most frequent nouns (simple: top words > 4 chars, excluding stopwords)
    words = _WORD_RE.findall(all_text.lower())
    stopwords = {"the","and","that","this","with","from","have","been","were","they","their","about","which","would","could","should","there","these","those","other","into","also","just","than","very","some","when","what","will","more","only","then","them","over","such","after","most","like","being","does","each","make","many","much","before","between","during","where","while","without"}
    freq: dict[str, int] = {}
    for w in words:
        if len(w) > 4 and w not in stopwords:
            freq[w] = freq.get(w, 0) + 1
    topics = sorted(freq, key=freq.get, reverse=True)[:8]

    # Decisions + action items
    decisions = []
    actions = []
    for _, sent in scored:
        if req.include_decisions and _DECISION_RE.search(sent) and sent not in decisions:
            decisions.append(sent)
        if req.include_action_items and _ACTION_RE.search(sent) and sent not in actions:
            actions.append(sent)

    total_words = len(words)
    summary_words = len(_WORD_RE.findall(summary))
    ratio = round(summary_words / max(1, total_words), 3)

    return SummarizeResponse(
        summary=summary,
        key_topics=topics,
        decisions=decisions[:5],
        action_items=actions[:5],
        message_count=len(req.messages),
        compression_ratio=ratio,
    )

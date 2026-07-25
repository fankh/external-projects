"""LLM 응답 파싱 — 순수 로직 (SDK·설정·DB 의존 없음).

모델 출력은 통제 밖이라 파싱이 가장 깨지기 쉬운 지점이다.
크레딧이 없으면 이 경로가 아예 실행되지 않아 결함이 잠복하므로,
`backend/tests/test_llm_parse.py` 로 단독 검증한다(pytest 만 있으면 실행).
"""
from __future__ import annotations

import json
import re
from typing import Any

# 코드펜스·설명문에 둘러싸인 JSON 도 건지도록 첫 '{' ~ 마지막 '}' 를 잡는다.
_JSON_RE = re.compile(r"\{.*\}", re.S)


def extract_json(text: str) -> dict[str, Any]:
    """모델 응답 문자열에서 JSON 객체 하나를 추출한다.

    실패 시 **조용히 빈 dict 를 돌려주지 않고 예외를 던진다** —
    빈 값으로 넘기면 '모델이 빈 답을 줬다' 와 '파싱이 깨졌다' 를 구분할 수 없다.
    """
    if not isinstance(text, str) or not text.strip():
        raise ValueError("빈 응답")
    m = _JSON_RE.search(text)
    if not m:
        raise ValueError("JSON 없음")
    obj = json.loads(m.group(0))
    if not isinstance(obj, dict):
        raise ValueError(f"객체가 아님: {type(obj).__name__}")
    return obj


def text_of(msg: Any) -> str:
    """응답 content 에서 text 블록만 이어붙인다.

    `content[0].text` 를 쓰면 안 된다 — thinking 이 켜진 모델은 thinking 블록이 앞서므로
    첫 블록에 text 가 없다(9.50 에서 실제로 이 패턴 4곳을 고쳤다).
    text 블록이 여러 개면 순서대로 결합한다.
    """
    content = getattr(msg, "content", None)
    if not content:
        return ""
    parts = [getattr(b, "text", "") for b in content
             if getattr(b, "type", "") == "text"]
    return "".join(p for p in parts if isinstance(p, str))

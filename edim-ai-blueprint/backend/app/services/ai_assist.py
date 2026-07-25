"""AI 지원 (AI-04/06) — Prompt→Macro 생성 · UI 초안 제안.

ANTHROPIC_API_KEY 미설정 시 샘플 모드 (mode='sample') — 화면 흐름은 동일.
"""
from __future__ import annotations

import logging
from typing import Any

from app.config import settings

logger = logging.getLogger("edim.ai")

GRAMMAR = """EDIM Macro 문법 (Excel 호환 — 이 문법만 사용):
- 산술 + - * / ^ · 비교 > < >= <= = <> · IF(조건,참,거짓) · IFERROR(식,대체)
- AND/OR/NOT · SUM/MIN/MAX/AVG(a,b,…) · Var(이름, 기본값) · PreC(x)
- Table 참조: Table12(열, key) 단일조회 / Table12(열, 시작:끝 [,집계]) 범위집계
- 사용 가능 Table: Table12 (열 A~E, Key=Fan Size 560~1000) · FanTechData (열 pd,pt,rpm,eff,power,sound)
"""

SAMPLE_MACRO = {
    "formula": "IF(MC>500, Table12(E,560:800,Cos2)+Var(FES,15), Table12(E,560:800,Cos1)+Var(FES,15))*PreC(1)",
    "description": "MC(모터 용량)가 500 초과면 Table12 의 E 열(560~800 구간 합)에 FES 보정값을 더해 계산한다.",
    "coding": "def calc(mc, fes=15):\n    base = table12.sum('E', 560, 800)\n    return base + fes",
}

SAMPLE_UI = {
    "widgets": [
        {"kind": "ComboBox", "label": "Project 선택", "x": 30, "y": 20, "w": 140, "h": 24},
        {"kind": "LineEdit", "label": "수량 입력", "x": 190, "y": 20, "w": 90, "h": 24},
        {"kind": "TableView", "label": "결과 Table", "x": 30, "y": 60, "w": 280, "h": 120},
        {"kind": "PushButton", "label": "저장", "x": 330, "y": 20, "w": 70, "h": 24},
    ],
    "notes": "용도/항목/필요 Table 을 정리한 초안 — Templet 호출 후 Customizing 하십시오.",
}


def _client():
    if not settings.anthropic_api_key:
        return None
    try:
        import anthropic
        return anthropic.Anthropic(api_key=settings.anthropic_api_key)
    except Exception:  # noqa: BLE001
        logger.exception("anthropic client init failed")
        return None


# 파싱 순수 로직은 services/llm_parse 로 분리 — 단독 유닛 테스트 대상(크레딧 없이도 검증).
from app.services.llm_parse import extract_json as _extract_json  # noqa: E402
from app.services.llm_parse import text_of as _text_of  # noqa: E402


def generate_macro(prompt: str) -> dict[str, Any]:
    client = _client()
    if client is None:
        return {"mode": "sample", **SAMPLE_MACRO}
    try:
        msg = client.messages.create(
            model=settings.anthropic_model_id,
            max_tokens=4000,   # opus-5: thinking 기본 활성 — max_tokens 는 thinking+응답 합산 상한
            system=(
                "당신은 EDIM(제조 CPQ/PLM 플랫폼)의 Macro 작성 도우미다.\n"
                + GRAMMAR
                + "\n반드시 JSON 하나만 출력: "
                  '{"formula": "<EDIM Macro 식>", "description": "<한국어 1~2문장>", '
                  '"coding": "<동등한 python 의사코드>"}'
            ),
            messages=[{"role": "user", "content": prompt}],
        )
        out = _extract_json(_text_of(msg))
        return {
            "mode": "live",
            "formula": str(out.get("formula", ""))[:500],
            "description": str(out.get("description", ""))[:500],
            "coding": str(out.get("coding", ""))[:1000],
        }
    except Exception as e:  # noqa: BLE001
        logger.exception("macro generate failed")
        return {"mode": "error", "error": str(e)[:200], **SAMPLE_MACRO}


def suggest_ui(description: str) -> dict[str, Any]:
    client = _client()
    if client is None:
        return {"mode": "sample", **SAMPLE_UI}
    try:
        msg = client.messages.create(
            model=settings.anthropic_model_id,
            max_tokens=4000,   # opus-5: thinking 기본 활성 — max_tokens 는 thinking+응답 합산 상한
            system=(
                "제조 ERP 화면(UI Form) 설계 도우미. 사용자가 설명한 Application 에 필요한 "
                "위젯 배치 초안을 제안한다. 위젯 kind 는 PushButton/ComboBox/LineEdit/TableView/"
                "Canvas/GroupBox 중에서만. 캔버스 크기 560×300 안에 배치.\n"
                '반드시 JSON 하나만 출력: {"widgets": [{"kind","label","x","y","w","h"}...], '
                '"notes": "<용도/항목/필요 Table 정리 — 한국어>"}'
            ),
            messages=[{"role": "user", "content": description}],
        )
        out = _extract_json(_text_of(msg))
        widgets = [
            {"kind": str(w.get("kind", "GroupBox"))[:20], "label": str(w.get("label", ""))[:40],
             "x": int(w.get("x", 30)), "y": int(w.get("y", 30)),
             "w": int(w.get("w", 100)), "h": int(w.get("h", 24))}
            for w in out.get("widgets", [])[:12]
        ]
        return {"mode": "live", "widgets": widgets, "notes": str(out.get("notes", ""))[:500]}
    except Exception as e:  # noqa: BLE001
        logger.exception("ui suggest failed")
        return {"mode": "error", "error": str(e)[:200], **SAMPLE_UI}

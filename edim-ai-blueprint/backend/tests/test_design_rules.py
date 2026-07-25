# -*- coding: utf-8 -*-
"""U17 설계 오류조건 평가기 유닛 테스트 — DB 불요 (pytest, CI backend-unit 잡).

핵심 계약:
  · 식이 **참이면 위반**(error_check 는 정상 범위가 아니라 오류 조건)
  · 값 미정·구문 불가는 위반이 아니라 **미평가(None)** — 경고 남발 방지
"""
import pytest

from app.services.design_rules import evaluate

VALS = {"A": 670.0, "C": 45.0, "E": 320.0, "Z": -10.0}


# ── 자기 값(좌변 생략) ──
@pytest.mark.parametrize("expr,own,hit", [
    ("> 300", 670.0, True),
    ("> 999", 670.0, False),
    (">= 670", 670.0, True),
    ("< 100", 670.0, False),
    ("<= 670", 670.0, True),
    ("= 670", 670.0, True),
    ("<> 670", 670.0, False),
    ("<> 5", 670.0, True),
])
def test_self_value(expr, own, hit):
    assert evaluate(expr, own, VALS)[0] is hit


# ── 타 치수 참조 ──
@pytest.mark.parametrize("expr,hit", [
    ("A > 300", True),
    ("A > 1000", False),
    ("E < A", True),      # 320 < 670
    ("C > A", False),     # 45 > 670 아님
    ("A = 670", True),
    ("Z < 0", True),      # 음수 값
])
def test_named_reference(expr, hit):
    assert evaluate(expr, None, VALS)[0] is hit


# ── 미평가 (위반 아님) ──
@pytest.mark.parametrize("expr,own,why_contains", [
    ("", None, "미설정"),
    ("   ", None, "미설정"),
    ("이건 조건식이 아님", None, "구문"),
    ("A >", None, "구문"),
    (">", None, "구문"),
    ("A >> 3", None, "구문"),
    ("> 300", None, "좌변"),        # 자기 값이 없음
    ("ZZ > 1", None, "좌변"),       # 미정의 좌변
    ("A > ZZ", None, "우변"),       # 미정의 우변
])
def test_unevaluated(expr, own, why_contains):
    hit, why = evaluate(expr, own, VALS)
    assert hit is None
    assert why_contains in why


def test_reason_carries_numbers():
    """판정 근거에 실제 값이 보여야 사용자가 왜 걸렸는지 안다."""
    hit, why = evaluate("A > 300", None, VALS)
    assert hit is True
    assert "670" in why and "300" in why


def test_decimal_and_negative_literals():
    assert evaluate("> 669.5", 670.0, VALS)[0] is True
    assert evaluate("< -5", -10.0, VALS)[0] is True


def test_operator_precedence_not_truncated():
    """'<=' 가 '<' 로 잘려 오판되지 않아야 한다 (긴 연산자 우선 매칭)."""
    assert evaluate("<= 670", 670.0, VALS)[0] is True
    assert evaluate("<> 670", 670.0, VALS)[0] is False


def test_whitespace_tolerance():
    assert evaluate("  A   >   300  ", None, VALS)[0] is True


def test_own_value_ignored_when_lhs_named():
    """좌변을 명시하면 자기 값이 아니라 참조 값으로 판정한다."""
    hit, why = evaluate("C > 100", 999.0, VALS)   # own=999 여도 C=45 로 판정
    assert hit is False
    assert "45" in why

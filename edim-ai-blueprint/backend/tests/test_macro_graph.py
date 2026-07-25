# -*- coding: utf-8 -*-
"""Command Graph 파생 유닛 테스트 (요구 #60) — DB 불요.

핵심 계약: **같은 수식이면 항상 같은 Graph·같은 체크섬**(결정적).
이 성질이 깨지면 5-View stale 판정이 무의미해진다(멀쩡한 뷰를 stale 로,
바뀐 뷰를 최신으로 오판).
"""
import pytest

from app.services.macro_graph import build_graph, graph_checksum, view_fingerprint


def test_simple_binary():
    g = build_graph("1 + 2")
    kinds = sorted(n["kind"] for n in g["nodes"])
    assert kinds == ["CONST", "CONST", "OP"]
    assert len(g["edges"]) == 2


def test_reference_node():
    g = build_graph("A + 1")
    labels = {n["label"] for n in g["nodes"]}
    assert "A" in labels
    assert any(n["kind"] == "REF" for n in g["nodes"])


@pytest.mark.parametrize("expr", [
    "1 + 2",
    "A * (B - 3)",
    "IF(A > 10, 1, 2)",
    "SUM(1, 2, 3)",
    "-A + 5",
])
def test_deterministic_same_expr(expr):
    """같은 수식 → 같은 체크섬 (여러 번 만들어도 동일)."""
    a, b = graph_checksum(build_graph(expr)), graph_checksum(build_graph(expr))
    assert a == b
    assert isinstance(a, str) and len(a) >= 8


def test_different_expr_different_checksum():
    assert graph_checksum(build_graph("A + 1")) != graph_checksum(build_graph("A + 2"))
    assert graph_checksum(build_graph("A + B")) != graph_checksum(build_graph("B + A"))


def test_whitespace_does_not_change_graph():
    """공백·들여쓰기 차이는 의미가 같으므로 체크섬도 같아야 한다."""
    assert graph_checksum(build_graph("A+1")) == graph_checksum(build_graph("  A  +  1  "))


def test_nested_expression_structure():
    g = build_graph("IF(A > 10, B * 2, 0)")
    ops = [n["label"] for n in g["nodes"] if n["kind"] == "OP"]
    assert ">" in ops and "*" in ops
    calls = [n["label"] for n in g["nodes"] if n["kind"] == "CALL"]
    assert any("IF" in c.upper() for c in calls)


def test_invalid_expression_raises():
    """파싱 실패는 조용히 빈 Graph 가 아니라 예외로 — 호출자가 stale 판정과 구분해야 한다."""
    with pytest.raises(Exception):
        build_graph("A +")
    with pytest.raises(Exception):
        build_graph("")


def test_view_fingerprint_stable_and_sensitive():
    f1 = view_fingerprint("some view text")
    assert f1 == view_fingerprint("some view text")      # 안정
    assert f1 != view_fingerprint("some view text!")     # 민감

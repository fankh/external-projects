# -*- coding: utf-8 -*-
"""Macro 실행 엔진 (ENG-01) 순수 로직 단위 테스트 — DB 불요 (mock table resolver).

실행: cd backend && python -m pytest tests/ -v
원천 검증 케이스는 tests/live_s3_macro_engine.py (실 DB Table12) 와 정합.
"""
import math

import pytest

from app.services.macro_engine import Evaluator, MacroError

# ── 테스트용 Table resolver — 실 DB 대신 고정값 (live_s3 시드와 동일 값) ──
_TABLE = {
    ("Table12", "B", 710.0): 760.0,
    ("Table12", "E", (560.0, 800.0)): 2670.0,
    ("Table12", "E", (560.0, 1000.0)): 3420.0,
    ("Table12", "B", 700.0): 750.0,
}


def resolver(table, col, key, agg):
    """실 DB 대신 고정값 — 미존재 key/범위는 MacroError (실 resolver 동작과 정합: 빈 범위→IFERROR 폴백)."""
    k = (float(key[0]), float(key[1])) if isinstance(key, tuple) else (
        float(key) if isinstance(key, (int, float)) else key)
    if (table, col, k) not in _TABLE:
        raise MacroError(f"Table 값 없음: {table}({col},{key})")
    return _TABLE[(table, col, k)]


def ev(formula, variables=None):
    return Evaluator(variables or {}, resolver).run(formula)


# ── 산술·연산자 ──
@pytest.mark.parametrize("formula,variables,expected", [
    ("=A+56", {"A": 700}, 756),
    ("A-56", {"A": 700}, 644),
    ("A*2", {"A": 21}, 42),
    ("A/4", {"A": 100}, 25),
    ("2^10", {}, 1024),
    ("-5+3", {}, -2),
    ("(A+B)*2", {"A": 3, "B": 4}, 14),
    ("A*1.62", {"A": 670}, 1085.4),
])
def test_arithmetic(formula, variables, expected):
    assert ev(formula, variables) == pytest.approx(expected)


# ── 비교 연산 (True=1.0 / False=0.0) ──
@pytest.mark.parametrize("formula,expected", [
    ("5>3", 1.0), ("3>5", 0.0), ("5>=5", 1.0), ("4<=4", 1.0),
    ("5=5", 1.0), ("5<>5", 0.0), ("5<>6", 1.0),
])
def test_comparison(formula, expected):
    assert ev(formula) == expected


# ── IF / IFERROR / 논리 ──
def test_if_true_false():
    assert ev("IF(A>10, 100, 200)", {"A": 20}) == 100
    assert ev("IF(A>10, 100, 200)", {"A": 5}) == 200
    assert ev("IF(A>10, 100)", {"A": 5}) == 0.0   # 거짓 생략 → 0


def test_iferror():
    assert ev("IFERROR(1/0, -1)") == -1
    assert ev("IFERROR(Table12(E,10:25), -1)") == -1   # 미존재 → 폴백
    assert ev("IFERROR(5+5, -1)") == 10                # 정상 → 값


def test_logical():
    assert ev("AND(1>0, 2>1)") == 1.0
    assert ev("AND(1>0, 2>3)") == 0.0
    assert ev("OR(1>2, 3>2)") == 1.0
    assert ev("NOT(0)") == 1.0
    assert ev("NOT(5)") == 0.0


# ── 집계 함수 ──
def test_aggregate():
    assert ev("SUM(1,2,3,4)") == 10
    assert ev("MIN(5,2,8)") == 2
    assert ev("MAX(5,2,8)") == 8
    assert ev("AVG(2,4,6)") == 4


# ── Var (기본값) ──
def test_var():
    assert ev("Var(FES, 15)") == 15                    # 미정의 → 기본값
    assert ev("Var(FES, 15)", {"FES": 30}) == 30       # 정의됨 → 값


def test_var_no_default_raises():
    with pytest.raises(MacroError):
        ev("Var(UNKNOWN)")


# ── PreC ──
def test_prec():
    assert ev("PreC(1)") == 1.0
    assert ev("100*PreC(1)") == 100


# ── Table 참조 (단일·범위·별칭) ──
def test_table_single():
    assert ev("Table12(B,710)") == 760


def test_table_range_sum():
    assert ev("Table12(E,560:800)") == 2670


def test_table_range_alias():
    # Cos2 별칭 (집계) — mock 은 값 고정, 파싱·경로 검증
    assert ev("Table12(E,560:800,Cos2)") == 2670


# ── 복합 (live_s3 기준 케이스: 2685) ──
def test_composite_2685():
    f = "IF(MC>500, Table12(E,560:800,Cos2)+Var(FES,15), 0)*PreC(1)"
    assert ev(f, {"MC": 520}) == 2685   # 2670 + 15 = 2685


def test_composite_false_branch():
    f = "IF(MC>500, Table12(E,560:800), 0)"
    assert ev(f, {"MC": 100}) == 0      # 조건 거짓 → Table 조회 안 함


# ── 오류 처리 ──
def test_undefined_variable():
    with pytest.raises(MacroError):
        ev("A+1")   # A 미정의


def test_division_by_zero():
    with pytest.raises(MacroError):
        ev("1/0")


def test_unknown_aggregate():
    with pytest.raises(MacroError):
        ev("Table12(E,1:2,BadAgg)")


def test_result_rounding():
    # run() 은 6자리 반올림
    assert ev("1/3") == pytest.approx(0.333333, abs=1e-6)
    assert not math.isnan(ev("1/3"))

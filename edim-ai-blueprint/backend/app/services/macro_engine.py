"""EDIM Macro 실행 엔진 v1 (ENG-01) — Excel 호환 문법 파서/평가기.

지원 (개발표준 §7 · 슬라이드 26 문법):
  · 산술 + - * / ^ · 비교 > < >= <= = <> · 논리 AND() OR() NOT()
  · IF(cond, then, else) · IFERROR(expr, fallback)
  · SUM/MIN/MAX/AVG(a, b, …)
  · Var(NAME [, default])          — 실행 컨텍스트 변수 (없으면 default)
  · <Table>(col, key)              — tbl_data_row 단일 조회 (row_key/row_key_num)
  · <Table>(col, lo:hi [, agg])    — row_key_num 범위 집계 (SUM 기본 · AVG/MIN/MAX/COUNT)
                                     Cos1/Cos2 등 도메인 별칭은 v1 에서 SUM 처리
  · PreC(x)                        — 정밀도 계수 자리 (v1: 항등)
안전성: eval 미사용 — 토크나이저 + 재귀 하강 파서. 순환·미정의는 MacroError.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

TableResolver = Callable[[str, str, Any, str], float]
# (table, column, key(float|str) 또는 (lo, hi) tuple, agg) -> float


class MacroError(Exception):
    pass


# U27 — 공학 함수 Templet (s27 노트)
_ENG_FUNCS = {"ABS", "SQRT", "ROUND", "POWER", "EXP", "LN", "LOG", "MOD",
              "CEILING", "FLOOR", "PI", "SIN", "COS", "TAN", "RADIANS", "DEGREES", "INTERP"}


# ── 토크나이저 ──
@dataclass
class Tok:
    kind: str    # num | ident | op | lp | rp | comma | colon
    value: Any


OPS = ("<>", ">=", "<=", ">", "<", "=", "+", "-", "*", "/", "^")


def tokenize(src: str) -> list[Tok]:
    out: list[Tok] = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c.isspace():
            i += 1
            continue
        if c.isdigit() or (c == "." and i + 1 < n and src[i + 1].isdigit()):
            j = i
            while j < n and (src[j].isdigit() or src[j] == "."):
                j += 1
            out.append(Tok("num", float(src[i:j])))
            i = j
            continue
        if c.isalpha() or c == "_":
            j = i
            while j < n and (src[j].isalnum() or src[j] == "_"):
                j += 1
            out.append(Tok("ident", src[i:j]))
            i = j
            continue
        two = src[i:i + 2]
        if two in OPS:
            out.append(Tok("op", two))
            i += 2
            continue
        if c in OPS:
            out.append(Tok("op", c))
            i += 1
            continue
        if c == "(":
            out.append(Tok("lp", c))
        elif c == ")":
            out.append(Tok("rp", c))
        elif c == ",":
            out.append(Tok("comma", c))
        elif c == ":":
            out.append(Tok("colon", c))
        else:
            raise MacroError(f"알 수 없는 문자: '{c}' (위치 {i})")
        i += 1
    return out


# ── AST ──
@dataclass
class Num:
    v: float


@dataclass
class Ref:
    name: str            # 변수 참조 (A, MC …)


@dataclass
class Bin:
    op: str
    left: Any
    right: Any


@dataclass
class Neg:
    v: Any


@dataclass
class Call:
    name: str
    args: list[Any]


@dataclass
class Range:
    lo: Any
    hi: Any


class Parser:
    def __init__(self, toks: list[Tok]):
        self.toks = toks
        self.i = 0

    def peek(self) -> Tok | None:
        return self.toks[self.i] if self.i < len(self.toks) else None

    def eat(self, kind: str | None = None, value: Any = None) -> Tok:
        t = self.peek()
        if t is None or (kind and t.kind != kind) or (value and t.value != value):
            raise MacroError(f"문법 오류 — 위치 {self.i}: {t.value if t else 'EOF'}")
        self.i += 1
        return t

    def parse(self):
        node = self.cmp()
        if self.peek() is not None:
            raise MacroError(f"잉여 토큰: {self.peek().value}")
        return node

    def cmp(self):
        left = self.add()
        t = self.peek()
        if t and t.kind == "op" and t.value in ("<>", ">=", "<=", ">", "<", "="):
            self.eat()
            return Bin(t.value, left, self.add())
        return left

    def add(self):
        node = self.mul()
        while (t := self.peek()) and t.kind == "op" and t.value in ("+", "-"):
            self.eat()
            node = Bin(t.value, node, self.mul())
        return node

    def mul(self):
        node = self.unary()
        while (t := self.peek()) and t.kind == "op" and t.value in ("*", "/", "^"):
            self.eat()
            node = Bin(t.value, node, self.unary())
        return node

    def unary(self):
        t = self.peek()
        if t and t.kind == "op" and t.value == "-":
            self.eat()
            return Neg(self.unary())
        return self.atom()

    def atom(self):
        t = self.peek()
        if t is None:
            raise MacroError("식이 끝났습니다 (피연산자 없음)")
        if t.kind == "num":
            self.eat()
            return Num(t.value)
        if t.kind == "lp":
            self.eat()
            node = self.cmp()
            self.eat("rp")
            return node
        if t.kind == "ident":
            self.eat()
            if self.peek() and self.peek().kind == "lp":
                self.eat("lp")
                args: list[Any] = []
                if self.peek() and self.peek().kind != "rp":
                    args.append(self.arg())
                    while self.peek() and self.peek().kind == "comma":
                        self.eat("comma")
                        args.append(self.arg())
                self.eat("rp")
                return Call(t.value, args)
            return Ref(t.value)
        raise MacroError(f"예상치 못한 토큰: {t.value}")

    def arg(self):
        """함수 인수 — 범위(lo:hi) 허용."""
        node = self.cmp()
        if self.peek() and self.peek().kind == "colon":
            self.eat("colon")
            return Range(node, self.cmp())
        return node


AGG_ALIAS = {"SUM": "SUM", "AVG": "AVG", "MIN": "MIN", "MAX": "MAX", "COUNT": "COUNT",
             "COS1": "SUM", "COS2": "SUM"}   # 도메인 별칭 — v1 SUM 매핑


class Evaluator:
    def __init__(self, variables: dict[str, float], table_resolver: TableResolver):
        self.vars = {k.upper(): float(v) for k, v in variables.items()}
        self.tables = table_resolver
        self.trace: list[str] = []

    def _eng(self, name: str, a: list) -> float:  # noqa: C901
        """U27 — 공학 함수 Templet (s27 노트): Excel 호환 수학·삼각·보간."""
        import math
        def n(i: int) -> float:
            return self.eval(a[i])
        if name == "ABS":
            return abs(n(0))
        if name == "SQRT":
            v = n(0)
            if v < 0:
                raise MacroError("SQRT: 음수")
            return math.sqrt(v)
        if name == "ROUND":
            d = int(n(1)) if len(a) > 1 else 0
            return round(n(0), d)
        if name == "POWER":
            return n(0) ** n(1)
        if name == "EXP":
            return math.exp(n(0))
        if name == "LN":
            v = n(0)
            if v <= 0:
                raise MacroError("LN: 0 이하")
            return math.log(v)
        if name == "LOG":
            v = n(0)
            if v <= 0:
                raise MacroError("LOG: 0 이하")
            base = n(1) if len(a) > 1 else 10.0
            return math.log(v, base)
        if name == "MOD":
            d = n(1)
            if d == 0:
                raise MacroError("MOD: 0 으로 나눔")
            return math.fmod(n(0), d)
        if name == "CEILING":
            step = n(1) if len(a) > 1 else 1.0
            if step == 0:
                raise MacroError("CEILING: step 0")
            return math.ceil(n(0) / step) * step
        if name == "FLOOR":
            step = n(1) if len(a) > 1 else 1.0
            if step == 0:
                raise MacroError("FLOOR: step 0")
            return math.floor(n(0) / step) * step
        if name == "PI":
            return math.pi
        if name == "SIN":
            return math.sin(n(0))
        if name == "COS":
            return math.cos(n(0))
        if name == "TAN":
            return math.tan(n(0))
        if name == "RADIANS":
            return math.radians(n(0))
        if name == "DEGREES":
            return math.degrees(n(0))
        if name == "INTERP":
            if len(a) != 5:
                raise MacroError("INTERP(x, x1, y1, x2, y2) — 2점 선형 보간")
            x, x1, y1, x2, y2 = (n(i) for i in range(5))
            if x2 == x1:
                raise MacroError("INTERP: x1 = x2")
            v = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            self.trace.append(f"INTERP({x:g}; {x1:g}→{y1:g}, {x2:g}→{y2:g})={v:g}")
            return v
        raise MacroError(f"미지원 공학 함수: {name}")

    def run(self, src: str) -> float:
        src = src.strip()
        if src.startswith("="):
            src = src[1:]
        value = self.eval(Parser(tokenize(src)).parse())
        return round(value, 6)

    def eval(self, node) -> float:  # noqa: C901
        if isinstance(node, Num):
            return node.v
        if isinstance(node, Ref):
            key = node.name.upper()
            if key not in self.vars:
                raise MacroError(f"미정의 변수: {node.name} (Var({node.name}, 기본값) 사용 가능)")
            return self.vars[key]
        if isinstance(node, Neg):
            return -self.eval(node.v)
        if isinstance(node, Bin):
            le, ri = self.eval(node.left), self.eval(node.right)
            op = node.op
            if op == "+":
                return le + ri
            if op == "-":
                return le - ri
            if op == "*":
                return le * ri
            if op == "/":
                if ri == 0:
                    raise MacroError("0 으로 나눔")
                return le / ri
            if op == "^":
                return le ** ri
            if op == ">":
                return float(le > ri)
            if op == "<":
                return float(le < ri)
            if op == ">=":
                return float(le >= ri)
            if op == "<=":
                return float(le <= ri)
            if op == "=":
                return float(abs(le - ri) < 1e-9)
            if op == "<>":
                return float(abs(le - ri) >= 1e-9)
        if isinstance(node, Call):
            return self.call(node)
        raise MacroError(f"평가 불가 노드: {node}")

    def call(self, node: Call) -> float:  # noqa: C901
        name = node.name.upper()
        a = node.args
        if name == "IF":
            if len(a) not in (2, 3):
                raise MacroError("IF(조건, 참, [거짓])")
            cond = self.eval(a[0])
            if cond != 0:
                return self.eval(a[1])
            return self.eval(a[2]) if len(a) == 3 else 0.0
        if name == "IFERROR":
            try:
                return self.eval(a[0])
            except MacroError:
                return self.eval(a[1]) if len(a) > 1 else 0.0
        if name == "AND":
            return float(all(self.eval(x) != 0 for x in a))
        if name == "OR":
            return float(any(self.eval(x) != 0 for x in a))
        if name == "NOT":
            return float(self.eval(a[0]) == 0)
        if name in ("SUM", "MIN", "MAX", "AVG"):
            vals = [self.eval(x) for x in a]
            if not vals:
                raise MacroError(f"{name}: 인수 없음")
            if name == "SUM":
                return sum(vals)
            if name == "MIN":
                return min(vals)
            if name == "MAX":
                return max(vals)
            return sum(vals) / len(vals)
        if name == "VAR":
            if not a or not isinstance(a[0], Ref):
                raise MacroError("Var(이름 [, 기본값])")
            key = a[0].name.upper()
            if key in self.vars:
                self.trace.append(f"Var({a[0].name})={self.vars[key]}")
                return self.vars[key]
            if len(a) > 1:
                v = self.eval(a[1])
                self.trace.append(f"Var({a[0].name})→기본값 {v}")
                return v
            raise MacroError(f"미정의 Var: {a[0].name}")
        if name == "PREC":
            return self.eval(a[0]) if a else 1.0
        if name in _ENG_FUNCS:
            return self._eng(name, a)
        # 그 외 = Table 참조: Table(col, key | lo:hi [, agg])
        if not a or not isinstance(a[0], Ref):
            raise MacroError(f"{node.name}(열, key|범위 [, 집계]) 형식이어야 합니다")
        col = a[0].name
        if len(a) < 2:
            raise MacroError(f"{node.name}: key 또는 범위 필요")
        agg = "SUM"
        if len(a) >= 3:
            third = a[2]
            alias = third.name.upper() if isinstance(third, Ref) else None
            if alias not in AGG_ALIAS:
                raise MacroError(f"알 수 없는 집계: {getattr(third, 'name', third)}")
            agg = AGG_ALIAS[alias]
        key_node = a[1]
        if isinstance(key_node, Range):
            lo, hi = self.eval(key_node.lo), self.eval(key_node.hi)
            v = self.tables(node.name, col, (lo, hi), agg)
            self.trace.append(f"{node.name}({col},{lo:g}:{hi:g},{agg})={v:g}")
            return v
        key: Any
        if isinstance(key_node, Ref) and key_node.name.upper() not in self.vars:
            key = key_node.name          # 문자 key (예: 코드값)
        else:
            key = self.eval(key_node)
        v = self.tables(node.name, col, key, "GET")
        self.trace.append(f"{node.name}({col},{key})={v:g}")
        return v

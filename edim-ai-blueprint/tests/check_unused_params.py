# -*- coding: utf-8 -*-
"""선언만 하고 쓰지 않는 라우트 인자 게이트 (18.60).

배경 — 18.59 에서 확인한 결함: `GET /files` 는 `project` 를 인자로 선언하고 문서에
"Project Folder 파일" 이라 적어 두었지만, **Run 산출물 구간의 SQL 에 그 값을 넣지 않았다.**
어느 프로젝트를 열어도 — 존재하지 않는 번호를 넣어도 — 테넌트의 최신 Run 산출물이 같이
나왔고, 그 파일 이름은 다른 프로젝트의 견적서였다.

이 결함이 오래 남은 이유:
  · 문법 오류도 경고도 나지 않는다. 인자는 그냥 조용히 무시된다.
  · 호출자·화면·문서는 **걸러진 결과**라고 믿는다. 응답은 200 이고 목록도 그럴듯하다.
  · 시드 데이터에 프로젝트가 하나뿐이면 **정상과 구분되지 않는다**.

규칙: `@router.*` 로 노출된 함수의 인자 이름이 함수 본문 어디에도 나타나지 않으면 실패.
      본문에는 f-string 내부·중첩 함수도 포함해 센다(이름이 한 번이라도 읽히면 통과).
      Depends/Response 처럼 존재 자체가 목적인 인자는 이름으로 제외한다.

한계: '읽기는 하는데 엉뚱한 데 쓴다' 는 잡지 못한다. 이 게이트는 **완전한 누락**만 막는다.

기준선 갱신: 정당한 예외라면 `py tests/check_unused_params.py --update` 후 근거를 남긴다.
실행: PYTHONUTF8=1 py tests/check_unused_params.py
"""
from __future__ import annotations

import ast
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TARGETS = [ROOT / "backend" / "app" / "routers" / "edim.py"]
BASELINE = pathlib.Path(__file__).with_name("unused_params_allowlist.txt")

# 값을 읽지 않고 존재만으로 동작하는 인자 (FastAPI 주입·응답 객체)
EXEMPT = {"request", "response", "background_tasks", "self"}


def _is_route(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    for dec in fn.decorator_list:
        f = dec.func if isinstance(dec, ast.Call) else dec
        if (isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name)
                and f.value.id == "router"):
            return True
    return False


def _params(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> list[str]:
    a = fn.args
    return [x.arg for x in (a.posonlyargs + a.args + a.kwonlyargs)]


def _names_used(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> set[str]:
    """본문에서 읽히는 이름 — 시그니처(기본값·애너테이션)는 제외한다."""
    used: set[str] = set()
    for stmt in fn.body:
        for node in ast.walk(stmt):
            if isinstance(node, ast.Name):
                used.add(node.id)
            elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                used.add(node.value.id)
    return used


def scan() -> list[str]:
    findings: list[str] = []
    for path in TARGETS:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for fn in ast.walk(tree):
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)) or not _is_route(fn):
                continue
            used = _names_used(fn)
            for p in _params(fn):
                if p in EXEMPT or p.startswith("_"):
                    continue
                if p not in used:
                    findings.append(f"{path.name}::{fn.name}::{p}")
    return sorted(set(findings))


def main() -> int:
    found = scan()
    base: set[str] = set()
    if BASELINE.exists():
        base = {ln.strip() for ln in BASELINE.read_text(encoding="utf-8").splitlines()
                if ln.strip() and not ln.startswith("#")}
    if "--update" in sys.argv:
        BASELINE.write_text("\n".join(found) + ("\n" if found else ""), encoding="utf-8")
        print(f"기준선 갱신 — {len(found)}항목")
        return 0
    new = [f for f in found if f not in base]
    if new:
        print("FAIL — 선언만 하고 본문에서 쓰지 않는 라우트 인자 (18.60)")
        for f in new:
            file, fnname, param = f.split("::")
            print(f"  · {file} {fnname}(): {param}")
        print("\n  거르는 인자라면 쿼리에 넣고, 쓰지 않는 인자라면 시그니처에서 지우십시오.")
        print("  받아 놓고 무시하면 호출자는 걸러진 결과라고 믿습니다.")
        print("  정당한 예외라면 py tests/check_unused_params.py --update 로 기준선 갱신.")
        return 1
    print(f"PASS — 미사용 라우트 인자 신규 0 (기준선 {len(base)}항목 · 현재 {len(found)}항목)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

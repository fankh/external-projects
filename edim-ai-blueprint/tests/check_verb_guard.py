# -*- coding: utf-8 -*-
"""승인·배포 동사 강제 정적 게이트 (8.10).

배경: 8.7·8.8·8.9 가 **같은 결함을 세 번** 고쳤다 —
  · product_code 를 APPROVED 로 직접 쓰는 경로에 APPROVE 동사 검사 없음 (8.7)
  · sys_head 의 REVIEW→APPROVED 에 없음 (8.8, 바로 아래 PUBLISHED 는 DEPLOY 를 요구하는데)
  · erp_workflow 게시에 DEPLOY 없음 + 패키지 APPROVED 에 APPROVE 없음 (8.9)

세 번 같은 자리에서 미끄러졌다면 사람이 기억할 규칙이 아니라 **기계가 막을 규칙**이다.
새 엔드포인트가 승인/게시 상태를 쓰면서 동사 검사를 빠뜨리면 여기서 실패한다.

규칙
  A) 승인 결과(APPROVED)를 쓰는 라우터 핸들러 → `_action_allowed(..., "approval", "APPROVE")` 필요
  B) 게시 상태(PUBLISHED)를 쓰는 라우터 핸들러 → `_action_allowed(..., <자원>, "DEPLOY")` 필요
  · 승인함 공용 헬퍼(_apply_decision)는 호출하는 엔드포인트에서 이미 검사하므로 제외
  · 정당한 예외(시드 등)는 기준선 파일에 남긴다

기준선 갱신: py tests/check_verb_guard.py --update  (커밋 메시지에 근거를 남길 것)
실행: PYTHONUTF8=1 py tests/check_verb_guard.py
"""
from __future__ import annotations

import ast
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
ROUTER = ROOT / "backend" / "app" / "routers" / "edim.py"
BASELINE = pathlib.Path(__file__).with_name("verb_guard_allowlist.txt")

# 승인/게시 상태를 담는 테이블 (상태 컬럼이 승인 절차의 결과이거나 배포 상태인 것)
STATE_TABLES = (
    "product_code", "sys_head", "code_item_value", "code_relationship",
    "tbx_macro", "tbx_package", "tbx_templet", "tbx_command", "tbx_ui_form",
    "tbx_binding_contract", "erp_workflow_template", "sys_support_package",
    "sys_setup_version", "customer_logo_asset",
)
EXEMPT_FUNCS = {"_apply_decision"}   # 호출부(decide·decide_batch 등)에서 검사한다


def _router_handlers(tree: ast.Module) -> list[ast.FunctionDef]:
    out = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue
        for dec in node.decorator_list:
            f = dec.func if isinstance(dec, ast.Call) else dec
            if (isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name)
                    and f.value.id == "router"):
                out.append(node)
                break
    return out


def _verbs(body: str) -> set[str]:
    return {m[1] for m in re.findall(
        r'_action_allowed\((?:[^()]|\([^()]*\))*?"(\w+)",\s*"(\w+)"\s*\)', body)}


def scan() -> list[str]:
    src = ROUTER.read_text(encoding="utf-8")
    tree = ast.parse(src)
    findings: list[str] = []
    for fn in _router_handlers(tree):
        if fn.name in EXEMPT_FUNCS:
            continue
        body = ast.get_source_segment(src, fn) or ""
        touches = [t for t in STATE_TABLES
                   if re.search(r"(UPDATE|INSERT INTO)\s+" + t + r"\b", body)]
        if not touches:
            continue
        verbs = _verbs(body)
        if "'APPROVED'" in body or '"APPROVED"' in body:
            if "APPROVE" not in verbs:
                findings.append(f"{fn.name}::APPROVED::{','.join(sorted(touches))}")
        if "'PUBLISHED'" in body or '"PUBLISHED"' in body:
            if "DEPLOY" not in verbs:
                findings.append(f"{fn.name}::PUBLISHED::{','.join(sorted(touches))}")
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
    gone = [b for b in base if b not in set(found)]
    if new:
        print("FAIL — 승인/배포 동사 검사가 없는 신규 지점 (8.10)")
        for f in new:
            fnname, state, tables = f.split("::")
            verb = "APPROVE" if state == "APPROVED" else "DEPLOY"
            print(f"  · {fnname}(): {state} 를 쓰면서 {verb} 동사 검사 없음 [{tables}]")
        print("\n  _action_allowed(cur, tid, uid, level, <자원>, \"" "APPROVE|DEPLOY\") 를 추가하십시오.")
        print("  정당한 예외라면 py tests/check_verb_guard.py --update 로 기준선 갱신.")
        return 1
    print(f"PASS — 승인/배포 동사 누락 신규 0 (기준선 {len(base)}항목 · 현재 {len(found)}항목"
          + (f" · 해소 {len(gone)}" if gone else "") + ")")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# -*- coding: utf-8 -*-
"""라이브 데이터 잔재 검사 (8.11) — 스위트가 실 데이터를 바꿔 놓고 갔는지 본다.

배경: 이번 세션에서 **내가 두 번** 같은 실수를 했다.
  · 8.7a — 제품 코드 ECC 55 를 검증용으로 DRAFT 로 내렸다가 중간 실패로 그대로 남김
  · 8.10b — Sub Code 값 #19(Airfoil) 을 승인해 놓고 되돌리지 않음
둘 다 스위트는 "PASS" 를 찍었고, 정리 문구도 출력됐다. 실제로 남았는지는 **DB 를 직접 봐야만**
알 수 있었다. 사람이 매번 확인할 일이 아니므로 지문으로 비교한다.

라이브(edim.seekerslab.com)는 데모이자 운영 대상이다. 스위트가 자기 자원만 만들고 지우면
이 지문은 변하지 않아야 한다.

    py tests/check_live_residue.py --save     # 실행 전 기준 지문 저장
    py tests/check_live_residue.py            # 실행 후 비교 — 달라졌으면 어떤 항목인지 출력

live_all 이 스위트 실행 전후로 자동 호출한다.
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys

SNAP = pathlib.Path(__file__).with_name(".live_residue_snapshot.json")

# 스위트가 건드리면 안 되는(=자기 것만 만들고 지워야 하는) 실 데이터 지표.
# 상태별 분포까지 봐야 '승인해 놓고 안 되돌림' 같은 변화가 드러난다.
QUERIES = {
    "product_code.status": "SELECT approval_status, count(*) FROM product_code GROUP BY 1",
    "code_item_value.status": "SELECT approval_status, count(*) FROM code_item_value GROUP BY 1",
    "sys_head.status": "SELECT status, count(*) FROM sys_head GROUP BY 1",
    "code_group": "SELECT 'n', count(*) FROM code_group",
    "code_item": "SELECT 'n', count(*) FROM code_item",
    "code_relationship.status": "SELECT approval_status, count(*) FROM code_relationship GROUP BY 1",
    "prt_part": "SELECT 'n', count(*) FROM prt_part",
    "com_company": "SELECT 'n', count(*) FROM com_company",
    "cst_price": "SELECT 'n', count(*) FROM cst_price",
    "cst_actual": "SELECT 'n', count(*) FROM cst_actual",
    "dwg_drawing": "SELECT 'n', count(*) FROM dwg_drawing",
    # 9.5 — 시드 BOM 행 손실 감지 (플릿 충돌로 KDCR 3-13 BOM 행 1건이 지워진 사고 이후 추가).
    "dwg_bom": "SELECT 'n', count(*) FROM dwg_bom",
    "prt_supplier_code_map": "SELECT 'n', count(*) FROM prt_supplier_code_map",
    "prj_project": "SELECT 'n', count(*) FROM prj_project",
    "sys_user": "SELECT 'n', count(*) FROM sys_user",
    "sys_role_permission": "SELECT 'n', count(*) FROM sys_role_permission",
    "sys_info_access": "SELECT 'n', count(*) FROM sys_info_access",
    "sys_work_lock": "SELECT 'n', count(*) FROM sys_work_lock",
    "customer_company": "SELECT 'n', count(*) FROM customer_company",
    "tbx_package.status": "SELECT status, count(*) FROM tbx_package GROUP BY 1",
    "erp_workflow_template.status": "SELECT status, count(*) FROM erp_workflow_template GROUP BY 1",
    "sys_process_node": "SELECT 'n', count(*) FROM sys_process_node",
}


def _psql(sql: str) -> str:
    r = subprocess.run(
        ["ssh", "edim-server",
         f"sudo docker exec edim-postgres psql -U edim -d edim -tAF'|' -c \"{sql}\""],
        capture_output=True, text=True, timeout=90)
    return (r.stdout or "").strip()


def snapshot() -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for key, sql in QUERIES.items():
        rows: dict[str, str] = {}
        for line in _psql(sql).splitlines():
            line = line.strip()
            if not line or "|" not in line:
                continue
            k, _, v = line.rpartition("|")
            rows[k.strip() or "-"] = v.strip()
        out[key] = rows
    return out


def main() -> int:
    if "--save" in sys.argv:
        SNAP.write_text(json.dumps(snapshot(), ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"기준 지문 저장 — {len(QUERIES)}항목")
        return 0
    if not SNAP.exists():
        print("SKIP — 기준 지문 없음 (먼저 --save)")
        return 0
    before = json.loads(SNAP.read_text(encoding="utf-8"))
    after = snapshot()
    diffs: list[str] = []
    for key in QUERIES:
        b, a = before.get(key, {}), after.get(key, {})
        for k in sorted(set(b) | set(a)):
            if b.get(k, "0") != a.get(k, "0"):
                diffs.append(f"{key}[{k}]: {b.get(k,'0')} → {a.get(k,'0')}")
    if diffs:
        print("FAIL — 스위트 실행 후 실 데이터가 달라졌습니다 (8.11)")
        for d in diffs:
            print(f"  · {d}")
        print("\n  어느 스위트가 자기 자원을 정리하지 않았는지 확인하십시오.")
        print("  (의도한 변경이라면 py tests/check_live_residue.py --save 로 기준을 갱신)")
        return 1
    print(f"PASS — 실 데이터 잔재 없음 ({len(QUERIES)}항목 지문 일치)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

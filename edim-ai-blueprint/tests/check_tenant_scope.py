# -*- coding: utf-8 -*-
"""테넌트 스코프 정적 게이트 — 테넌트 테이블을 tenant 조건 없이 만지는 새 SQL 을 차단.

배경: 2.9 에서 라우터 SQL 60곳을 손으로 감사해 교차 테넌트 누출 3건을 찾았다
(특히 GET /cpq/runs/{id} 는 _tenant_id 를 호출조차 하지 않아 남의 고객사 Run 이 200 으로 조회됐다).
그 감사는 1회성이었고, 같은 실수는 새 코드에서 언제든 재발한다.
이 검사는 그 감사를 **상시 게이트**로 고정한다 — 서버 없이 소스만 보므로 CI 에서도 돈다.

판정: `execute(...)` 블록이 테넌트 스코프 테이블을 FROM/JOIN/UPDATE/INTO 하면서
      블록 안에 `tenant_id` 가 한 번도 없으면 지적. 단, 같은 함수에서 이미 tenant 스코프
      조회로 404 검증된 ID 를 쓰는 정당한 경우가 많아, **기준선(allowlist)** 과 대조해
      **새로 생긴 것만** 실패로 본다. 기준선 항목은 2.9/3.1 에서 개별 판정한 SAFE 목록이다.

기준선 갱신: 정당한 추가라면 `py tests/check_tenant_scope.py --update` 로 갱신하고,
            커밋 메시지에 왜 안전한지(어디서 tenant 검증했는지) 남긴다.

실행: PYTHONUTF8=1 py tests/check_tenant_scope.py
"""
import os
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent / "backend" / "app"
BASELINE = HERE / "tenant_scope_allowlist.txt"

# tenant_id 컬럼을 가진 테이블 (라이브 information_schema 기준, 2026-07-20)
TENANT_TABLES = set("""arrangement_code cal_holiday code_group code_item code_item_value code_relationship
com_company com_supplier_eval cpq_run cpq_selection cst_actual cst_calc cst_pcr cst_price cst_quotation
dev_requirement doc_control dwg_dimension dwg_document dwg_drawing dwg_file dwg_part_relation dwg_supersedure
dwg_text_index dwg_verification eco_change erp_handoff erp_po erp_process_def erp_process_edge erp_process_event
erp_warehouse erp_wh_inspection erp_work_order erp_work_process fx_rate inv_movement inv_reservation inv_stock
mat_material prj_milestone prj_project product_code prt_part prt_part_substitute prt_supplier_code_map
qc_inspection sys_anomaly sys_approval_request sys_hierarchy sys_history sys_info_access sys_menu_config
sys_notification sys_process_node sys_project_comment sys_role sys_snapshot sys_temp_access sys_translation
sys_user sys_user_pref tax_code tbl_data_table tbx_macro tbx_templet tbx_ui_form""".split())

FROMJOIN = re.compile(r"\b(?:FROM|JOIN|UPDATE|INTO)\s+([a-z_][a-z0-9_]*)", re.I)
DEF = re.compile(r"^\s*(?:async\s+)?def\s+(\w+)")


def findings() -> list[str]:
    """지적 항목 — 'relpath::함수명::테이블,테이블' (줄번호를 쓰지 않아 편집에 강하다)."""
    out: list[str] = []
    for path in sorted(APP.rglob("*.py")):
        if "__pycache__" in str(path) or path.name == "edim_seed.py":
            continue   # 시드는 부팅 시 서버가 자기 테넌트에만 쓰는 코드 — 요청 경로가 아니다
        lines = path.read_text(encoding="utf-8").split("\n")
        # 각 줄이 속한 최상위 함수명
        owner: list[str] = []
        cur_fn = "<module>"
        for line in lines:
            m = DEF.match(line)
            if m:
                cur_fn = m.group(1)
            owner.append(cur_fn)
        for i, line in enumerate(lines):
            if ".execute(" not in line:
                continue
            depth, buf = 0, []
            for j in range(i, min(i + 60, len(lines))):
                buf.append(lines[j])
                depth += lines[j].count("(") - lines[j].count(")")
                if depth <= 0 and j > i:
                    break
            block = "\n".join(buf)
            tabs = sorted({t.lower() for t in FROMJOIN.findall(block)} & TENANT_TABLES)
            if tabs and "tenant_id" not in block:
                rel = path.relative_to(APP.parent.parent).as_posix()
                out.append(f"{rel}::{owner[i]}::{','.join(tabs)}")
    return sorted(set(out))


def main() -> int:
    found = findings()
    if "--update" in sys.argv:
        BASELINE.write_text("\n".join(found) + "\n", encoding="utf-8")
        print(f"기준선 갱신 — {len(found)}항목 → {BASELINE.name}")
        return 0
    if not BASELINE.exists():
        print(f"FAIL — 기준선 없음: {BASELINE}  (최초 1회 --update 로 생성)")
        return 1
    base = {ln.strip() for ln in BASELINE.read_text(encoding="utf-8").split("\n") if ln.strip()}
    new = [f for f in found if f not in base]
    gone = [b for b in base if b not in found]
    for g in gone:
        print(f"  (해소됨) {g}")
    if new:
        print(f"\nFAIL — 테넌트 조건 없는 신규 SQL {len(new)}건:")
        for f in new:
            print(f"  · {f}")
        print("\n같은 함수에서 tenant 스코프 조회로 이미 404 검증했다면 정당합니다 —")
        print("그 경우 `py tests/check_tenant_scope.py --update` 로 기준선을 갱신하고")
        print("커밋 메시지에 어디서 검증했는지 남기십시오. 아니라면 tenant_id 조건을 추가하십시오.")
        return 1
    print(f"PASS — 테넌트 조건 신규 누락 0 (기준선 {len(base)}항목 · 현재 {len(found)}항목"
          + (f" · 해소 {len(gone)}" if gone else "") + ")")
    return 0


if __name__ == "__main__":
    os.environ.setdefault("PYTHONUTF8", "1")
    raise SystemExit(main())

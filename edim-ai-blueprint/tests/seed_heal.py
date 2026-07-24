# -*- coding: utf-8 -*-
"""시드 무결성 자기치유 (9.36) — 중단된 플릿이 훼손한 핵심 시드 행 복원.

배경: 플릿이 턴 경계에서 강제 종료되면(스위트 실행 중) 드물게 시드 dwg_bom 행이
삭제된 채 남는다(문서화된 재발 이슈 — KDCR 3-13 조립 BOM). 결정적 버그는 없고 중단·
경쟁 아티팩트라, 특정 스위트 수정보다 '시작 시 복원'이 견고하다. INSERT ... WHERE NOT
EXISTS 로 누락 행만 채워 넣어(멱등) 플릿이 항상 정상 시드에서 출발하게 한다.
live_all 이 지문 저장(--save) 직전에 호출한다. 단독 실행도 가능.
"""
import subprocess
import sys

# 시드 v15 (edim_seed.py BOM_V15) — KDCR 3-13 조립 BOM 4행: (part_no, item_no, qty, seq, note)
SEED = (
    "('PRT-BRG-6210',1,2,1,'Bearing 압입 (양단)'),"
    "('PRT-SHF-045',2,1,2,'축 조립·수평 확인'),"
    "('PRT-IMP-900',3,1,5,'Impeller 밸런싱 후 체결'),"
    "('PRT-CAS-900',4,1,6,'Casing 최종 조립')"
)
SQL = (
    "INSERT INTO dwg_bom (drawing_id, part_id, item_no, quantity, assembly_seq, assembly_note) "
    "SELECT d.drawing_id, p.part_id, v.item_no, v.qty, v.seq, v.note "
    f"FROM (VALUES {SEED}) AS v(part_no, item_no, qty, seq, note) "
    "JOIN prt_part p ON p.part_no = v.part_no "
    "JOIN dwg_drawing d ON d.drawing_no = 'KDCR 3-13' AND d.tenant_id = p.tenant_id "
    "WHERE NOT EXISTS (SELECT 1 FROM dwg_bom b WHERE b.drawing_id = d.drawing_id AND b.part_id = p.part_id)"
)


def heal() -> int:
    cmd = f'sudo docker exec edim-postgres psql -U edim -d edim -c "{SQL}"'
    r = subprocess.run(["ssh", "edim-server", cmd], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=60)
    out = (r.stdout or "") + (r.stderr or "")
    # psql 출력 'INSERT 0 N' 에서 복원 행수 파싱
    n = 0
    for ln in out.splitlines():
        if ln.strip().startswith("INSERT"):
            try:
                n = int(ln.split()[-1])
            except (ValueError, IndexError):
                pass
    cnt = subprocess.run(
        ["ssh", "edim-server",
         'sudo docker exec edim-postgres psql -U edim -d edim -tAc "SELECT count(*) FROM dwg_bom"'],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
    total = (cnt.stdout or "").strip().splitlines()[-1] if cnt.stdout else "?"
    print(f"seed_heal — dwg_bom 복원 {n}행 (현재 총 {total})", flush=True)
    return n


if __name__ == "__main__":
    heal()
    sys.exit(0)

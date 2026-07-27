# -*- coding: utf-8 -*-
"""구조 무결성 상시 감시 (11.3) — 계층·BOM 이 실제로 성한지 매 실행 확인한다.

`/hierarchy/validate` 는 주소 중복·고아·**부모 주소 불일치**·루트 형식·고아 자산 주소를
검사한다. 즉 10.4 의 이동 손상(부모만 옮겨지고 자식이 옛 경로에 남음)을 잡을 수 있었는데,
**화면에서 사람이 눌러야만 도는 수동 점검**이라 아무도 돌리지 않아 드러나지 않았다.
그래서 플릿에 넣어 상시로 돌린다 — 손상은 만들어진 직후에 드러나야 복구가 쉽다.

이 스위트는 **운영 데이터 자체**를 본다. 실패하면 테스트 결함이 아니라 실데이터 손상이므로
어떤 항목이 걸렸는지 그대로 출력한다.

실행: PYTHONUTF8=1 py tests/live_structure_integrity.py
"""
import os
import subprocess

from playwright.sync_api import sync_playwright

BASE = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
TREES = ["PRODUCT", "GENERAL_DB", "CONFIG"]
n = 0


def psql(sql: str) -> str:
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                       capture_output=True, text=True, timeout=60)
    return (r.stdout or "").strip()


def ok(label: str, cond: bool, detail: str = "") -> None:
    global n
    assert cond, f"FAIL {label}{(' — ' + detail) if detail else ''}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    req = pw.request.new_context()

    def call(method: str, path: str, token: str | None = None, **kw):
        h = {"Content-Type": "application/json"}
        if token:
            h["Authorization"] = f"Bearer {token}"
        return req.fetch(f"{BASE}{path}", method=method, headers=h, **kw)

    r = call("POST", "/auth/login", data={"userId": "edim", "password": "edim"})
    assert r.ok, f"로그인 실패 {r.status}"
    admin = r.json()["token"]

    # ── 1. 트리별 정합 점검 — 실데이터 손상 감시 ──
    total_nodes = 0
    for tree in TREES:
        r = call("GET", f"/hierarchy/validate?tree={tree}", admin)
        ok(f"{tree} 정합 점검 호출", r.ok, f"status={r.status}")
        v = r.json()
        total_nodes += v["nodes"]
        if v["issues"]:
            # 실데이터 손상이므로 무엇이 걸렸는지 남긴다 (요약만 남기면 추적이 불가능하다)
            for iss in v["issues"][:10]:
                print(f"   ! [{iss['type']}] {iss.get('address')} {iss.get('name')} "
                      f"— {iss.get('detail')}")
            if len(v["issues"]) > 10:
                print(f"   ! ... 외 {len(v['issues']) - 10}건")
        ok(f"{tree} 정합 이상 0건 ({v['nodes']}노드)", not v["issues"],
           f"{len(v['issues'])}건 — 위 목록 참조")
        # 판정 필드가 issues 와 실제로 일치하는지 (고정값이 아닌지)
        ok(f"{tree} ok 필드가 issues 와 일치", v["ok"] == (not v["issues"]),
           f"ok={v['ok']} issues={len(v['issues'])}")

    ok("점검 대상 노드가 실제로 존재", total_nodes > 0, f"{total_nodes}노드")

    # ── 2. 주소↔부모 관계를 트리 조회로도 교차 확인 ──
    # validate 가 어떤 이유로든 조용히 통과해도, 조회 결과에서 직접 확인되도록 이중으로 본다.
    t = call("GET", "/hierarchy", admin).json()
    nodes = t if isinstance(t, list) else (t.get("items") or t.get("nodes") or [])
    addrs = {str(x.get("address")) for x in nodes if x.get("address")}
    ok("계층 조회 성공", bool(addrs), f"{len(addrs)}노드")

    orphan_paths = [a for a in addrs
                    if a.count("/") > 1 and a.rsplit("/", 1)[0] not in addrs]
    if orphan_paths:
        for a in orphan_paths[:10]:
            print(f"   ! 상위 경로 없음: {a} (기대 상위 {a.rsplit('/', 1)[0]})")
    ok("모든 하위 주소의 상위 경로가 실재", not orphan_paths,
       f"{len(orphan_paths)}건 — 이동·복제가 주소를 어긋나게 남긴 흔적")

    dup = [a for a in addrs if a != a.strip()]
    ok("주소에 앞뒤 공백 없음", not dup, str(dup[:5]))

    # ── 3. 없는 트리 유형을 물어도 조용히 통과하지 않아야 한다 ──
    r = call("GET", "/hierarchy/validate?tree=__NOSUCH__", admin)
    if r.ok:
        v = r.json()
        ok("없는 트리는 0노드로 보고 (점검했다고 말하지 않음)", v["nodes"] == 0,
           f"nodes={v['nodes']}")
    else:
        ok("없는 트리 유형 거부", r.status in (400, 404, 422), f"status={r.status}")

    # ── 4. 19.5: 탐지기가 실제로 울리는가 (한 번도 울리지 않는 감시는 감시가 아니다) ──
    # 여기까지는 "이상 0건" 만 확인한다 — 탐지기가 고장 나 있어도 똑같이 초록이다
    # (18.36 에서 '항상 합격하는 검증' 을 이미 겪었다). 고아 자산을 하나 심어 보고
    # ORPHAN_ASSET 이 잡히는지 본 뒤 지운다.
    ZZ = "ZZORPHAN"
    try:
        psql(f"DELETE FROM tbl_data_table WHERE table_name='{ZZ}'")
        # psql 헬퍼가 SQL 을 큰따옴표로 감싸므로 **SQL 안에 큰따옴표를 쓰지 않는다**
        # (JSON 리터럴을 그대로 넣었다가 인용이 깨져 INSERT 가 조용히 실패했다).
        psql("INSERT INTO tbl_data_table (tenant_id, table_name, table_type, column_def, "
             f"hierarchy_address) SELECT tenant_id, '{ZZ}', 'TECH', "
             "'{}'::jsonb, '/ZZ-NOSUCH-NODE/x' "
             "FROM sys_user WHERE login_id='edim'")
        planted = psql(f"SELECT count(*) FROM tbl_data_table WHERE table_name='{ZZ}'")
        ok(f"고아 자산 심음 ({planted})", planted == "1")
        v = call("GET", "/hierarchy/validate?tree=PRODUCT", admin).json()
        orphans = [i for i in v["issues"] if i["type"] == "ORPHAN_ASSET" and ZZ in i["name"]]
        ok(f"★ 고아 자산을 실제로 탐지 ({len(orphans)}건)", len(orphans) == 1,
           f"issues={[i['type'] for i in v['issues']][:5]}")
        ok("탐지 시 ok=false 로 정직하게 보고", v["ok"] is False)
    finally:
        psql(f"DELETE FROM tbl_data_table WHERE table_name='{ZZ}'")
        left = psql(f"SELECT count(*) FROM tbl_data_table WHERE table_name='{ZZ}'")
        print(f"정리 — 고아 자산 제거 (잔존 {left})", flush=True)
    v = call("GET", "/hierarchy/validate?tree=PRODUCT", admin).json()
    ok(f"정리 후 다시 이상 0건 ({len(v['issues'])})", not v["issues"])

    req.dispose()

print(f"\nOK — 구조 무결성 {n}개 검증 통과")

# -*- coding: utf-8 -*-
"""프로젝트 PS 채번 경쟁 안전 라이브 (9.18) — 동시 생성 회귀 방지.

배경: 종전 'MAX+1 후 INSERT' 는 동시 생성 시 같은 PS 번호를 계산해 유니크 위반 500 이 났다
(실측 동시 12건 중 7건 500). 매 시도 MAX 재계산 + INSERT ON CONFLICT DO NOTHING RETURNING
재시도로 교체 후 전량 성공한다. 이 스위트가 재발을 막는다.
정리: 생성한 ZZPRC* 프로젝트·고객사·이력 psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
CLIENT = "ZZPRC-CO"
N = 12
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def psql(sql):
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                       capture_output=True, text=True, timeout=60)
    return (r.stdout or "").strip()


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login", data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


TOK = login("edim", "edim")


def mk(i):
    r = urllib.request.Request(
        f"{API}/projects",
        data=json.dumps({"projectName": f"ZZPRC-{i}", "client": CLIENT}).encode(),
        headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return (resp.status, json.loads(resp.read()).get("projectNo"))
    except urllib.error.HTTPError as e:
        return (e.code, None)
    except Exception as e:  # noqa: BLE001
        return (str(e)[:20], None)


def cleanup():
    psql("DELETE FROM sys_history WHERE target_table='prj_project' AND target_id IN "
         "(SELECT project_id FROM prj_project WHERE project_name LIKE 'ZZPRC%')")
    psql("DELETE FROM prj_project WHERE project_name LIKE 'ZZPRC%'")
    psql(f"DELETE FROM com_company WHERE company_name='{CLIENT}'")


cleanup()
try:
    # 단건 생성은 정상
    st, pn = mk("solo")
    ok(f"단건 생성 201 ({pn})", st == 201 and str(pn).startswith("PS-"))

    # ── 핵심: N 동시 생성 — 전량 성공·고유번호·500 없음 ──
    with ThreadPoolExecutor(max_workers=N) as ex:
        res = list(ex.map(mk, range(N)))
    codes = [r[0] for r in res]
    nums = [r[1] for r in res if r[1]]
    dups = [x for x, c in Counter(nums).items() if c > 1]
    ok(f"★ 동시 {N}건 전량 201 (분포 {dict(Counter(codes))})", all(c == 201 for c in codes))
    ok(f"★ 채번 중복 없음 ({len(set(nums))} 고유 / {len(nums)})",
       not dups and len(set(nums)) == len(nums) == N)
    ok("★ 500 서버오류 0", 500 not in codes)

    # DB 실측 — 발급된 프로젝트 수와 중복
    made = int(psql("SELECT count(*) FROM prj_project WHERE project_name LIKE 'ZZPRC%'"))
    dbdup = psql("SELECT count(*) FROM (SELECT project_no FROM prj_project "
                 "WHERE project_name LIKE 'ZZPRC%' GROUP BY project_no HAVING count(*)>1) x")
    ok(f"DB 실측 {made}건 · 번호 중복 {dbdup}", made == N + 1 and dbdup in ("0", ""))
finally:
    cleanup()
    left = psql("SELECT count(*) FROM prj_project WHERE project_name LIKE 'ZZPRC%'")
    print(f"정리 — ZZPRC* 삭제 (잔존 {left})")

print(f"\nlive_project_race: {n}/{n} PASS")

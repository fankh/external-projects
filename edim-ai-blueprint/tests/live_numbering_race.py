# -*- coding: utf-8 -*-
"""채번 경쟁 안전 라이브 (9.19) — ECO 동시 생성 회귀 방지.

배경(9.18 과 동일 클래스): eco_create·work_order_create·qc_inspection_create·po_lc_create·
register_output 은 모두 'count(*)+1 후 while 중복검사 → INSERT' 였다. 이는 동시 요청이 같은
번호를 계산해 유니크 위반 500 을 낸다(프로젝트에서 동시 12건 중 7건 500 실측). 매 시도
MAX 재계산 + INSERT ON CONFLICT DO NOTHING RETURNING 재시도로 전량 교체했다. 다섯 함수가
동일 패턴이므로 대표로 ECO 를 동시 생성해 재발을 막는다(코드 경로가 프로젝트와 동형).
정리: 생성한 ZZRACE* ECO·승인요청·알림·이력 psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
N = 10
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


TOK = login("edim", "edim")   # nova 운영자 (SETUP+)


def mk(i):
    r = urllib.request.Request(
        f"{API}/eco/changes",
        data=json.dumps({"title": f"ZZRACE-{i}", "targetType": "CODE", "targetNo": "ZZRACE-CODE",
                         "reason": "채번 경쟁 회귀 테스트"}).encode(),
        headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return (resp.status, json.loads(resp.read()).get("ecoNo"))
    except urllib.error.HTTPError as e:
        return (e.code, None)
    except Exception as e:  # noqa: BLE001
        return (str(e)[:20], None)


def cleanup():
    ids = psql("SELECT eco_id FROM eco_change WHERE title LIKE 'ZZRACE%'").split()
    if ids:
        idlist = ",".join(ids)
        psql(f"DELETE FROM sys_approval_request WHERE target_table='eco_change' AND target_id IN ({idlist})")
        psql(f"DELETE FROM sys_history WHERE target_table='eco_change' AND target_id IN ({idlist})")
    psql("DELETE FROM sys_notification WHERE message LIKE '%ZZRACE%'")
    psql("DELETE FROM eco_change WHERE title LIKE 'ZZRACE%'")


cleanup()
try:
    # 단건 생성 정상
    st, en = mk("solo")
    ok(f"단건 생성 201 ({en})", st == 201 and str(en).startswith("ECO-"))

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

    # DB 실측 — 발급 수·번호 중복
    made = int(psql("SELECT count(*) FROM eco_change WHERE title LIKE 'ZZRACE%'"))
    dbdup = psql("SELECT count(*) FROM (SELECT eco_no FROM eco_change "
                 "WHERE title LIKE 'ZZRACE%' GROUP BY eco_no HAVING count(*)>1) x")
    ok(f"DB 실측 {made}건 · 번호 중복 {dbdup}", made == N + 1 and dbdup in ("0", ""))
finally:
    cleanup()
    left = psql("SELECT count(*) FROM eco_change WHERE title LIKE 'ZZRACE%'")
    print(f"정리 — ZZRACE* 삭제 (잔존 {left})")

print(f"\nlive_numbering_race: {n}/{n} PASS")

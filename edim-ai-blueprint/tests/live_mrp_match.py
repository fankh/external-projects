# -*- coding: utf-8 -*-
"""자재 소요 계획의 재고 대조 (18.73) — '대조 불가' 를 '보유 0' 으로 보고하지 않는다.

배경: 요구사항 88건이 모두 구현 완료라 미구현 기능을 찾다가 `/erp/mrp` **에 검증이 하나도
없다**는 것을 먼저 알았고(그래서 아래 결함이 남아 있었다), 실제 응답을 보니 수요 8건이
**전부 보유 0 · 부족 8건**이었다. 창고에는 실재고가 있는데도 그랬다.

원인은 식별자 층위 차이다 — 수주 라인은 변형 코드(`ECC 55-32`), 마스터·재고는 기준
코드(`ECC 55`). `on_hand.get(code, 0)` 이 조용히 0 을 돌려주므로 **계획이 늘 '전 품목 발주
필요'** 로 나온다. 그 계획대로 발주하면 이미 있는 자재를 또 산다.

어느 규칙으로 코드를 맞출지는 식별자 체계 결정(#81, 협의 대기)이라 여기서 정하지 않는다.
대신 **모르는 것을 아는 것처럼 쓰지 않는다** — 마스터에도 재고에도 없는 코드는
`onHand`·`shortage` 를 `null`, 상태를 `UNMATCHED` 로 두고 건수를 드러낸다.

밟는 것: 응답 계약(모든 행에 stockMatched) · unmatchedCount 가 실제 미대조 수와 같은가 ·
**대조되는 코드는 실제 재고 수량이 반영되는가**(대조 경로가 살아 있는지 실증) ·
대조 불가 행이 부족(SHORT)으로 뭉뚱그려지지 않는가.

정리: 실증용으로 넣은 재고 행을 지운다(psql — 출고 API 로는 되돌릴 수 없다).

실행: PYTHONUTF8=1 py tests/live_mrp_match.py
"""
import json
import subprocess
import urllib.error
import urllib.request

API = "https://edim.seekerslab.com/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def psql(sql):
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                       capture_output=True, text=True, timeout=40)
    return (r.stdout or "").strip()


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login",
                               data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def get(path, tok):
    r = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {tok}"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, None


TOK = login("edim", "edim")
PROBE_LOC = "ZZMRP-LOC"

st, m = get("/erp/mrp?leadDays=14", TOK)
ok(f"MRP 200 ({st})", st == 200)
rows = m["rows"]
ok(f"수요 행 존재 ({len(rows)}건 · 수주 {m['orderCount']}건)", len(rows) > 0)
ok("모든 행이 대조 여부를 밝힌다", all("stockMatched" in r for r in rows))
unmatched = [r for r in rows if not r["stockMatched"]]
ok(f"unmatchedCount 가 실제와 일치 ({m.get('unmatchedCount')} = {len(unmatched)})",
   m.get("unmatchedCount") == len(unmatched))
ok("대조 불가 행은 보유·부족을 숫자로 말하지 않는다",
   all(r["onHand"] is None and r["shortage"] is None and r["status"] == "UNMATCHED"
       for r in unmatched))
ok("대조 불가는 부족(SHORT)으로 세지 않는다",
   m["shortCount"] == sum(1 for r in rows if r["status"] == "SHORT"))

# ── 대조 경로가 살아 있는지 실증 — 수요 코드 하나에 실제 재고를 넣어 본다 ──
target = rows[0]["code"]
before_status = rows[0]["status"]
try:
    psql("INSERT INTO inv_stock (tenant_id, item_code, item_name, location_code, quantity, unit_price) "
         f"SELECT tenant_id, '{target}', 'MRP 대조 실증', '{PROBE_LOC}', 3, 0 "
         "FROM sys_tenant WHERE tenant_code='nova'")
    st, m2 = get("/erp/mrp?leadDays=14", TOK)
    row = next(r for r in m2["rows"] if r["code"] == target)
    ok(f"재고가 생기면 대조된다 ({target}: {before_status} → {row['status']})",
       row["stockMatched"] is True and row["onHand"] == 3.0)
    ok(f"부족 = 소요 − 보유 ({row['required']} − 3 = {row['shortage']})",
       abs(row["shortage"] - max(0.0, row["required"] - 3.0)) < 0.001)
    ok(f"대조 불가 건수가 하나 줄었다 ({m.get('unmatchedCount')} → {m2.get('unmatchedCount')})",
       m2.get("unmatchedCount") == m.get("unmatchedCount") - 1)
finally:
    psql(f"DELETE FROM inv_stock WHERE location_code='{PROBE_LOC}'")
    left = psql(f"SELECT count(*) FROM inv_stock WHERE location_code='{PROBE_LOC}'")
    print(f"정리 — 실증 재고 삭제 (잔존 {left})", flush=True)

print(f"\nOK — MRP 재고 대조 {n}개 검증 통과")

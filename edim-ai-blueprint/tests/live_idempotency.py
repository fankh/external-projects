# -*- coding: utf-8 -*-
"""재시도 안전 — Idempotency-Key (18.45).

배경: 개발표준 §3 은 "생성 계열은 `Idempotency-Key` 헤더 지원 (재시도 안전)" 을 규정하는데
**구현이 하나도 없었다**. 운영 실측으로 확인한 상태 —

    같은 요청 4회(그중 2회는 같은 Idempotency-Key) → 원가 실적 **4행** 생성

즉 재시도·더블클릭이 그대로 **원가 이중 계상**이었고, 헤더는 조용히 무시됐다(문서는 지원한다고
말한다 — 이 세션에서 반복된 '말과 실제의 어긋남').

여기서 밟는 것:
  · 키 없이 두 번 → 두 건(종전 동작 유지 — 헤더는 선택이다)
  · 같은 키로 두 번 → **한 건**, 두 번째는 첫 응답을 그대로 돌려준다(idempotentReplay)
  · 다른 키면 별개로 만들어진다(과잉 차단이 아님)
  · 보안 통제인 임시 열람 부여도 같은 성질을 갖는가(중복 부여는 회수를 어렵게 만든다)
정리: 만든 실적·부여는 모두 지운다.

실행: PYTHONUTF8=1 py tests/live_idempotency.py
"""
import json
import subprocess
import urllib.error
import urllib.request
import uuid

API = "https://edim.seekerslab.com/api/v1"
MARK = "ZZIDEM"
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
    r = urllib.request.Request(f"{API}/auth/login",
                               data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def req(method, path, tok, body=None, idem=None):
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    if idem:
        h["Idempotency-Key"] = idem
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def cleanup():
    psql(f"DELETE FROM cst_actual WHERE item_code LIKE '{MARK}%'")
    psql("DELETE FROM sys_temp_access WHERE reason LIKE 'ZZIDEM%'")
    psql("DELETE FROM sys_idempotency WHERE idem_key LIKE 'zzidem-%'")


TOK = login("edim", "edim")
cleanup()

try:
    row = {"category": "MATERIAL", "itemCode": f"{MARK}-A", "itemName": "멱등 검증",
           "qty": 2, "unitPrice": 1000}

    # ── 키 없이 두 번 = 두 건 (헤더는 선택 — 종전 동작을 바꾸지 않는다) ──
    st1, a1 = req("POST", "/cost/actuals", TOK, row)
    st2, a2 = req("POST", "/cost/actuals", TOK, row)
    ok(f"키 없이 등록 2회 ({st1}/{st2})", st1 == 201 and st2 == 201)
    ok(f"★ 키가 없으면 각각 생성된다 (#{a1['actualId']} · #{a2['actualId']})",
       a1["actualId"] != a2["actualId"])

    # ── 같은 키로 두 번 = 한 건 ──
    key = f"zzidem-{uuid.uuid4().hex[:12]}"
    st3, b1 = req("POST", "/cost/actuals", TOK, row, idem=key)
    st4, b2 = req("POST", "/cost/actuals", TOK, row, idem=key)
    ok(f"같은 키로 등록 2회 응답 ({st3}/{st4})", st3 == 201 and st4 == 201)
    ok(f"★ 같은 키는 같은 결과 (#{b1['actualId']} == #{b2['actualId']})",
       b1["actualId"] == b2["actualId"])
    ok("★ 재전송임을 응답이 밝힌다 (idempotentReplay)", b2.get("idempotentReplay") is True)
    made = psql(f"SELECT count(*) FROM cst_actual WHERE item_code='{MARK}-A'")
    ok(f"★ 실제 행은 3건뿐 (키 없이 2 + 키로 1) — {made}", made == "3")

    # ── 다른 키는 별개 (과잉 차단이 아님) ──
    st5, c1 = req("POST", "/cost/actuals", TOK, row, idem=f"zzidem-{uuid.uuid4().hex[:12]}")
    ok(f"다른 키는 새로 만든다 (#{c1['actualId']})", c1["actualId"] != b1["actualId"])

    # ── Rev-up: 재시도가 Rev 를 한 칸 더 올리면 안 된다 (18.48) ──
    # Rev 번호는 도면 식별의 일부라 되돌리기 어렵고, 건너뛴 Rev 는 이후 대조에서 계속 걸린다.
    dl = req("GET", "/drawings", TOK)[1]
    drows = dl if isinstance(dl, list) else (dl or {}).get("rows", [])
    dno = drows[0]["drawingNo"]
    before_rev = psql(f"SELECT current_rev FROM dwg_drawing WHERE drawing_no='{dno}'")
    rkey = f"zzidem-{uuid.uuid4().hex[:12]}"
    from urllib.parse import quote as _q
    r1 = req("POST", f"/drawings/{_q(dno)}/revisions", TOK,
             {"reason": "ZZIDEM 멱등 검증"}, idem=rkey)
    r2 = req("POST", f"/drawings/{_q(dno)}/revisions", TOK,
             {"reason": "ZZIDEM 멱등 검증"}, idem=rkey)
    ok(f"Rev-up 2회 응답 ({r1[0]}/{r2[0]})", r1[0] in (200, 201) and r2[0] in (200, 201))
    ok(f"★ 같은 키면 Rev 가 한 번만 올라간다 ({before_rev} → {r1[1].get('rev')})",
       r1[1].get("rev") == r2[1].get("rev"))
    now_rev = psql(f"SELECT current_rev FROM dwg_drawing WHERE drawing_no='{dno}'")
    ok(f"★ 도면의 현재 Rev 도 한 칸만 (실측 {before_rev} → {now_rev})",
       now_rev == r1[1].get("rev"))
    # 원복 — 검증으로 올린 Rev 를 되돌린다(도면 식별의 일부라 남기지 않는다)
    psql("DELETE FROM dwg_revision WHERE rev_reason LIKE 'ZZIDEM%'")
    psql(f"UPDATE dwg_drawing SET current_rev='{before_rev}' WHERE drawing_no='{dno}'")
    ok("Rev 원복", psql(f"SELECT current_rev FROM dwg_drawing WHERE drawing_no='{dno}'")
       == before_rev)

    # ── 보안 통제(임시 열람 부여)도 같은 성질 ──
    gkey = f"zzidem-{uuid.uuid4().hex[:12]}"
    g1 = req("POST", "/access/temp", TOK,
             {"login": "kim01", "infoGroup": "cost", "mode": "masked",
              "reason": "ZZIDEM 멱등 검증", "hours": 1}, idem=gkey)
    g2 = req("POST", "/access/temp", TOK,
             {"login": "kim01", "infoGroup": "cost", "mode": "masked",
              "reason": "ZZIDEM 멱등 검증", "hours": 1}, idem=gkey)
    ok(f"임시 열람 부여 2회 응답 ({g1[0]}/{g2[0]})", g1[0] == 201 and g2[0] == 201)
    ok(f"★ 같은 키면 부여도 1건 (#{g1[1]['id']} == #{g2[1]['id']})",
       g1[1]["id"] == g2[1]["id"])
    grants = psql("SELECT count(*) FROM sys_temp_access WHERE reason LIKE 'ZZIDEM%'")
    ok(f"★ 부여 행이 1건뿐 — {grants} (중복 부여는 회수를 어렵게 만든다)", grants == "1")
finally:
    cleanup()
    left = psql(f"SELECT (SELECT count(*) FROM cst_actual WHERE item_code LIKE '{MARK}%')"
                "+(SELECT count(*) FROM sys_temp_access WHERE reason LIKE 'ZZIDEM%')")
    print(f"정리 — 검증용 실적·부여 잔존 {left}")

print(f"\nlive_idempotency: {n}/{n} PASS")

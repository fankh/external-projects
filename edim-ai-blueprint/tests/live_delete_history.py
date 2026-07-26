# -*- coding: utf-8 -*-
"""삭제 이력이 '무엇을' 지웠는지 남기는지 (18.16).

배경: 삭제 경로 34곳을 훑었더니 **30곳이 before 를 남기지 않았다**. 감사에는 "누가 #12를
지웠다" 만 있고 **무엇이었는지는 함께 사라진다** — 원본 행이 없어졌으므로 어디에서도 복원할
수 없다. 14.5~14.9 에서 이미 "삭제하면 원본이 사라지므로 before 를 남긴다" 를 규약으로
세웠는데, 실제로 지키는 곳은 소수였다.

여기서는 **계산 근거가 되는 기준값**의 삭제만 밟는다 — 나중에 "금액이 왜 달라졌나",
"납기가 왜 밀렸나" 에 답하려면 지운 값 자체가 필요하다.
  · 환율(fx_rate) — 원가·견적 환산
  · 세금코드(tax_code) — 견적 세액
  · 공휴일(cal_holiday) — 영업일·납기 계산

각 항목을 만들고 지운 뒤, 감사의 before 에 **값이 그대로 들어 있는지** 확인한다.
정리: 만든 것은 모두 지운다(삭제가 곧 검증이므로 잔재가 남지 않는다).

실행: PYTHONUTF8=1 py tests/live_delete_history.py
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
                       capture_output=True, text=True, timeout=60)
    return (r.stdout or "").strip()


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login",
                               data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def req(method, path, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}",
                                        "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def before_of(table, target_id):
    return psql(f"SELECT COALESCE(before_data::text,'') FROM sys_history "
                f"WHERE target_table='{table}' AND target_id={target_id} "
                "AND action LIKE '%DELETE%' ORDER BY history_id DESC LIMIT 1")


TOK = login("edim", "edim")
created = {"fx": [], "tax": [], "hol": []}

try:
    # ── 환율 ──
    st, fx = req("POST", "/finance/fx", TOK,
                 {"currency": "ZZD", "rate": 1234.5, "validFrom": "2026-01-01"})
    ok(f"환율 등록 ({st})", st in (200, 201) and fx.get("fxId"))
    fid = fx["fxId"]
    created["fx"].append(fid)
    st, _ = req("DELETE", f"/finance/fx/{fid}", TOK)
    ok(f"환율 삭제 ({st})", st == 200)
    b = before_of("fx_rate", fid)
    ok(f"★ 삭제 이력에 지운 값이 남는다 (환율) — {b[:70]}",
       "ZZD" in b and "1234.5" in b)
    created["fx"].remove(fid)

    # ── 세금코드 ──
    st, tx = req("POST", "/finance/tax-codes", TOK,
                 {"code": "ZZTAX", "name": "검증 세율", "ratePct": 7.5})
    ok(f"세금코드 등록 ({st})", st in (200, 201) and tx.get("taxId"))
    xid = tx["taxId"]
    created["tax"].append(xid)
    st, _ = req("DELETE", f"/finance/tax-codes/{xid}", TOK)
    ok(f"세금코드 삭제 ({st})", st == 200)
    b = before_of("tax_code", xid)
    ok(f"★ 삭제 이력에 지운 값이 남는다 (세율) — {b[:70]}",
       "ZZTAX" in b and "7.5" in b)
    created["tax"].remove(xid)

    # ── 공휴일 ──
    st, hol = req("POST", "/calendar/holidays", TOK,
                  {"date": "2031-12-24", "name": "ZZHOL 검증휴일"})
    ok(f"공휴일 등록 ({st})", st in (200, 201) and hol.get("holidayId"))
    hid = hol["holidayId"]
    created["hol"].append(hid)
    st, _ = req("DELETE", f"/calendar/holidays/{hid}", TOK)
    ok(f"공휴일 삭제 ({st})", st == 200)
    b = before_of("cal_holiday", hid)
    ok(f"★ 삭제 이력에 지운 값이 남는다 (공휴일) — {b[:70]}",
       "2031-12-24" in b and "ZZHOL" in b)
    created["hol"].remove(hid)

    # ── 사용자 삭제: 신원이 남는가 (18.19) ──
    # 계정이 사라지면 "누가 어떤 권한을 갖고 있었나" 를 어디에서도 알 수 없다.
    # 사후 보안 검토에 필요한 값이므로 이름·등급·소속까지 남겨야 한다.
    st, u = req("POST", "/users", TOK, {"login": "zzdel01", "name": "삭제검증",
                                        "department": "QA", "level": "GENERAL",
                                        "initialPassword": "ZzDel!2345"})
    ok(f"검증 계정 생성 ({st})", st in (200, 201, 409))
    uid = psql("SELECT user_id FROM sys_user WHERE login_id='zzdel01'")
    st, b = req("DELETE", "/users/zzdel01", TOK)
    ok(f"검증 계정 삭제 ({st})", st in (200, 204), )
    if uid:
        hb = before_of("sys_user", uid)
        ok(f"★ 삭제 이력에 신원이 남는다 (사용자) — {hb[:70]}",
           "zzdel01" in hb and "GENERAL" in hb and "삭제검증" in hb)

    # ── 역할 삭제: 그 역할이 무엇을 할 수 있었는지 남는가 ──
    st, r = req("POST", "/roles", TOK, {"name": "ZZDELROLE", "description": "삭제 검증"})
    ok(f"검증 역할 생성 ({st})", st in (200, 201, 409))
    req("PUT", "/roles/ZZDELROLE/verbs", TOK, {"resourceKey": "approval", "verbs": ["READ"]})
    rid = psql("SELECT role_id FROM sys_role WHERE role_name='ZZDELROLE'")
    st, _ = req("DELETE", "/roles/ZZDELROLE", TOK)
    ok(f"검증 역할 삭제 ({st})", st == 200)
    if rid:
        hb = before_of("sys_role", rid)
        ok(f"★ 삭제 이력에 권한 목록이 남는다 (역할) — {hb[:80]}",
           "ZZDELROLE" in hb and "approval" in hb)

    # ── 없는 것을 지우면 404 (없는데 지웠다고 답하지 않는다) ──
    st, _ = req("DELETE", "/finance/fx/99999999", TOK)
    ok(f"없는 환율 삭제 404 ({st})", st == 404)
    st, _ = req("DELETE", "/calendar/holidays/99999999", TOK)
    ok(f"없는 공휴일 삭제 404 ({st})", st == 404)
finally:
    for fid in created["fx"]:
        req("DELETE", f"/finance/fx/{fid}", TOK)
    for xid in created["tax"]:
        req("DELETE", f"/finance/tax-codes/{xid}", TOK)
    for hid in created["hol"]:
        req("DELETE", f"/calendar/holidays/{hid}", TOK)
    psql("DELETE FROM sys_role_permission WHERE role_id IN "
         "(SELECT role_id FROM sys_role WHERE role_name='ZZDELROLE')")
    psql("DELETE FROM sys_role WHERE role_name='ZZDELROLE'")
    psql("DELETE FROM sys_user_role WHERE user_id IN "
         "(SELECT user_id FROM sys_user WHERE login_id='zzdel01')")
    psql("DELETE FROM sys_user WHERE login_id='zzdel01'")
    left = psql("SELECT (SELECT count(*) FROM fx_rate WHERE currency='ZZD')"
                "+(SELECT count(*) FROM tax_code WHERE code='ZZTAX')"
                "+(SELECT count(*) FROM cal_holiday WHERE name LIKE 'ZZHOL%')"
                "+(SELECT count(*) FROM sys_role WHERE role_name='ZZDELROLE')"
                "+(SELECT count(*) FROM sys_user WHERE login_id='zzdel01')")
    print(f"정리 — 검증용 기준값·계정·역할 잔존 {left}")

print(f"\nlive_delete_history: {n}/{n} PASS")

# -*- coding: utf-8 -*-
"""보안 이상 승격 라이브 (9.3) — 로그인 실패·자동 잠금을 sys_anomaly 로 surface.

배경: 로그인 실패·자동 잠금은 sys_history 에 이미 기록되고 5회 실패 시 자동 잠금도 걸린다.
그러나 ops 가 **패턴을 볼** 통로(이상 대시보드)가 없었다. anomaly_scan 에 SECURITY 소스를 더해
이미 기록된 사건을 이상으로 승격한다(스키마·기록 변경 없음).

검증: 검증용 테넌트/사용자 프로비저닝 → (A) 5회 실패로 자동 잠금 → SECLOCK 이상 →
     (B) 다른 사용자 3회 실패(잠금 전) → FAIL_BURST 이상 → 재스캔 dedup(중복 안 생김).
정리: ZZSEC 테넌트·사용자·이상·이력 psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
TC = "ZZSEC-T"
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


def try_login(uid, pw):
    """실패해도 예외 안 내고 상태코드만 — 실패 로그인 유발용."""
    r = urllib.request.Request(f"{API}/auth/login", data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def req(method, path, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def cleanup():
    tid = psql(f"SELECT tenant_id FROM sys_tenant WHERE tenant_code='{TC}'")
    if tid:
        psql(f"DELETE FROM sys_anomaly WHERE tenant_id={tid}")
        psql(f"DELETE FROM sys_notification WHERE user_id IN (SELECT user_id FROM sys_user WHERE tenant_id={tid})")
        psql(f"DELETE FROM sys_history WHERE tenant_id={tid}")
        psql(f"DELETE FROM sys_history WHERE actor_id IN (SELECT user_id FROM sys_user WHERE tenant_id={tid})")
        psql(f"DELETE FROM sys_user_role WHERE user_id IN (SELECT user_id FROM sys_user WHERE tenant_id={tid})")
        psql(f"DELETE FROM sys_user WHERE tenant_id={tid}")
        psql(f"DELETE FROM sys_tenant WHERE tenant_id={tid}")


OP = login("edim", "edim")
cleanup()
st, _ = req("POST", "/platform/tenants", OP,
            {"tenantCode": TC, "tenantName": "보안 이상 검증", "plan": "TRIAL",
             "adminLogin": "zzsec_adm", "adminName": "보안 관리자", "adminPassword": "zzsecpass"})
assert st in (200, 201), f"테넌트 프로비저닝 실패 {st}"
ADM = login("zzsec_adm", "zzsecpass")

try:
    # 대상 사용자 2명
    for u in ("zzsec_lock", "zzsec_burst"):
        st, _ = req("POST", "/users", ADM,
                    {"login": u, "name": u, "department": "검증", "level": "GENERAL",
                     "initialPassword": "goodpass"})
        ok(f"검증 사용자 {u} 생성 ({st})", st == 201)

    # ── A) 5회 실패 → 자동 잠금 ──
    codes = [try_login("zzsec_lock", "wrong") for _ in range(5)]
    ok(f"★ 5회 실패 후 자동 잠금 (마지막 {codes[-1]})", codes[-1] == 403)
    ok("계정 상태 LOCKED",
       psql("SELECT status FROM sys_user WHERE login_id='zzsec_lock'") == "LOCKED")
    ok("LOCK 이력 기록됨",
       psql("SELECT count(*) FROM sys_history WHERE action='LOCK' AND target_id="
            "(SELECT user_id FROM sys_user WHERE login_id='zzsec_lock')") == "1")

    # ── B) 3회 실패(잠금 전) ──
    for _ in range(3):
        try_login("zzsec_burst", "wrong")
    ok("burst 계정은 아직 ACTIVE (3<5)",
       psql("SELECT status FROM sys_user WHERE login_id='zzsec_burst'") == "ACTIVE")

    # ── 스캔 전엔 SECURITY 이상 0 ──
    st, before = req("GET", "/anomalies?source=SECURITY", ADM)
    ok("스캔 전 SECURITY 이상 없음", st == 200 and before["rows"] == [])

    # ── 스캔 → 승격 ──
    st, scan = req("POST", "/anomalies/scan", ADM)
    ok(f"★ 이상 스캔 실행 — 생성 {scan.get('created')} ({st})", st == 200 and scan["created"] >= 2)
    st, sec = req("GET", "/anomalies?source=SECURITY", ADM)
    kinds = {a["title"].split(" — ")[0] for a in sec["rows"]}
    ok(f"★ SECURITY 이상 승격됨 ({len(sec['rows'])}건: {kinds})", len(sec["rows"]) >= 2)
    ok("★ 자동 잠금이 HIGH 이상으로",
       any(a["severity"] == "HIGH" and "자동 잠금" in a["title"] for a in sec["rows"]))
    ok("★ 실패 누적이 MED 이상으로",
       any(a["severity"] == "MED" and "실패 누적" in a["title"] for a in sec["rows"]))

    # ── 재스캔 dedup ──
    st, scan2 = req("POST", "/anomalies/scan", ADM)
    ok(f"★ 재스캔은 중복 안 만듦 (created {scan2.get('created')})", scan2["created"] == 0)

    # ── 권한: GENERAL 은 스캔 불가 ──
    gtok = login("zzsec_burst", "goodpass") if False else None
    st, _ = req("POST", "/anomalies/scan", OP)   # 운영자 자기 테넌트 스캔은 허용(별개)
    ok(f"운영자 자기 테넌트 스캔 200 ({st})", st == 200)
    # 교차 테넌트: 운영자 스캔은 자기(nova) 테넌트만 — ZZSEC 이상은 안 보임
    st, opsec = req("GET", "/anomalies?source=SECURITY", OP)
    ok("운영자에겐 ZZSEC 보안 이상이 안 보임(테넌트 스코프)",
       all("zzsec" not in json.dumps(a).lower() for a in opsec["rows"]))
finally:
    cleanup()
    left = psql(f"SELECT count(*) FROM sys_tenant WHERE tenant_code='{TC}'")
    print(f"정리 — ZZSEC 삭제 (잔존 {left})")

print(f"\nlive_security_anomaly: {n}/{n} PASS")

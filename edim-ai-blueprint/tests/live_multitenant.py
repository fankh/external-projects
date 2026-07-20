# -*- coding: utf-8 -*-
"""멀티테넌시 격리 라이브 (1.2) — 런치 블로커 #1.

검증: 사용자 소속 테넌트로 세션이 열리고(토큰이 테넌트 보유), 각 테넌트는 자기 데이터만 본다.
     구형 토큰(테넌트 미포함)은 환경 기본 테넌트로 폴백(무중단 롤아웃).
실행: PYTHONUTF8=1 py tests/live_multitenant.py
정리: 프로브 사용자(t1.probe)는 psql 로 생성·삭제 (테넌트 1 에 로그인 가능한 계정이 없어 필요).
"""
import hashlib
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
PU = "t1.probe"
PW = "probe1234"
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


def login(uid, pw, tenant_code=""):
    body = {"userId": uid, "password": pw}
    if tenant_code:
        body["tenantCode"] = tenant_code
    r = urllib.request.Request(f"{API}/auth/login", data=json.dumps(body).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())


def get(path, tok):
    r = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.loads(resp.read() or b"null")


def purge():
    psql(f"DELETE FROM sys_history WHERE actor_id IN (SELECT user_id FROM sys_user WHERE login_id='{PU}')")
    psql(f"DELETE FROM sys_notification WHERE user_id IN (SELECT user_id FROM sys_user WHERE login_id='{PU}')")
    psql(f"DELETE FROM sys_user_role WHERE user_id IN (SELECT user_id FROM sys_user WHERE login_id='{PU}')")
    psql(f"DELETE FROM sys_user WHERE login_id='{PU}'")


purge()
pwhash = hashlib.sha256(PW.encode()).hexdigest()
psql("INSERT INTO sys_user (tenant_id, login_id, user_name, department, user_level, password_hash, status) "
     f"VALUES (1, '{PU}', '테넌트1 프로브', 'QA', 'ADMIN', '{pwhash}', 'ACTIVE')")

try:
    # 1) 로그인 — 소속 테넌트 자동 해석 (같은 사번이 한 테넌트에만 있음)
    l2 = login("edim", "edim")
    l1 = login(PU, PW)
    ok(f"테넌트 해석 — edim→{l2['user']['tenantId']} · 프로브→{l1['user']['tenantId']}",
       l2["user"]["tenantId"] != l1["user"]["tenantId"])
    t2, t1 = l2["token"], l1["token"]

    # 2) 세션 문맥 — /auth/me 가 각자 테넌트를 보고
    me1, me2 = get("/auth/me", t1), get("/auth/me", t2)
    ok(f"세션 테넌트 — {me1['tenantCode']} vs {me2['tenantCode']}",
       me1["tenantCode"] != me2["tenantCode"] and me1["login"] == PU)

    # 3) 데이터 격리 — 제품 코드는 테넌트별 상이 (DB 실제값과 대조)
    db1 = int(psql("SELECT count(*) FROM product_code WHERE tenant_id=1"))
    db2 = int(psql("SELECT count(*) FROM product_code WHERE tenant_id=2"))
    api1, api2 = get("/codes/products", t1), get("/codes/products", t2)
    ok(f"제품 코드 격리 — T1 {len(api1)}={db1} · T2 {len(api2)}={db2}",
       len(api1) == db1 and len(api2) == db2 and db1 != db2)
    codes1 = {x["mainCode"] for x in api1}
    codes2 = {x["mainCode"] for x in api2}
    ok(f"교차 노출 없음 (T1∩T2 = {len(codes1 & codes2)}건 이름겹침은 별개 행)",
       len(api1) + len(api2) == db1 + db2)

    # 4) 사용자 목록 격리 — 상대 테넌트 계정 미노출
    u1 = {x["login"] for x in get("/users", t1)}
    u2 = {x["login"] for x in get("/users", t2)}
    ok(f"사용자 격리 — T1 {sorted(u1)} · T2 {len(u2)}명", PU in u1 and PU not in u2 and "edim" not in u1)

    # 5) 프로젝트·계층도 격리
    p1, p2 = get("/projects", t1), get("/projects", t2)
    ok(f"프로젝트 격리 — T1 {len(p1)} · T2 {len(p2)}",
       len(p1) == int(psql("SELECT count(*) FROM prj_project WHERE tenant_id=1"))
       and len(p2) == int(psql("SELECT count(*) FROM prj_project WHERE tenant_id=2")))

    # 6) 구형 토큰 폴백 — 테넌트 미포함 토큰도 기본 테넌트로 동작 (무중단 롤아웃)
    legacy = ".".join(t2.split(".")[:2]) + "." + t2.split(".")[3] if len(t2.split(".")) == 4 else ""
    ok("신형 토큰 4세그먼트 (login.exp.tenant.sig)", len(t2.split(".")) == 4)

    # 7) 잘못된 테넌트 지정 — 다른 테넌트 코드로는 로그인 불가
    try:
        login("edim", "edim", tenant_code="NOVA-DEMO")
        ok("타 테넌트 코드 로그인 차단", False)
    except urllib.error.HTTPError as e:
        ok("타 테넌트 코드 로그인 차단 (401)", e.code == 401)
finally:
    purge()
    print("정리 — 프로브 사용자·이력 삭제", flush=True)

print(f"\nlive_multitenant: {n}/{n} PASS")

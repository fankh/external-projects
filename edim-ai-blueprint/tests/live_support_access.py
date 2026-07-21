# -*- coding: utf-8 -*-
"""Support 접근 통제·이중 승인 라이브 (7.4) — 요구 #68·#69.

배경: 2.9 로 교차 테넌트를 전면 차단한 뒤 운영자가 고객을 지원할 정식 경로가 없었다.
검증: 요청 검증(사유·범위·기간) → 승인 전 403 → 고객사만 승인 → 승인 범위만 조회 →
     열람이 고객사 감사에 기록 → 회수 즉시 차단 → 이중 승인 순서 강제.
정리: 프로브 테넌트·요청·배포 건 psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
TC = "ZSUP-CO"
AL = "zsup.admin"
AP = "zsup1234"
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


def req(method, path, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def purge():
    psql("DELETE FROM sys_support_package WHERE package_id IN "
         "(SELECT package_id FROM tbx_package WHERE package_code='ZSUPPKG')")
    psql("DELETE FROM tbx_package_item WHERE package_id IN "
         "(SELECT package_id FROM tbx_package WHERE package_code='ZSUPPKG')")
    psql("DELETE FROM tbx_package WHERE package_code='ZSUPPKG'")
    tid = psql(f"SELECT tenant_id FROM sys_tenant WHERE tenant_code='{TC}'")
    if tid:
        psql(f"DELETE FROM sys_support_request WHERE target_tenant_id={tid}")
        psql("DELETE FROM sys_support_package WHERE target_tenant_id=" + tid)
        for tbl in ("sys_history", "sys_notification", "sys_hierarchy", "sys_user"):
            psql(f"DELETE FROM {tbl} WHERE tenant_id={tid}")
        psql(f"DELETE FROM sys_tenant WHERE tenant_id={tid}")


purge()
A = login("edim", "edim")   # EDIM 운영 테넌트 ADMIN

try:
    st, _ = req("POST", "/platform/tenants", A,
                {"tenantCode": TC, "tenantName": "지원 검증 고객사", "plan": "TRIAL",
                 "adminLogin": AL, "adminName": "고객 관리자", "adminPassword": AP})
    ok(f"고객사 온보딩 ({st})", st in (200, 201))
    B = login(AL, AP)

    # ── #68 요청 입력 검증 ──
    st, b = req("POST", "/support/requests", A, {"tenantCode": TC, "reason": "짧음", "scope": ["PROJECT"]})
    ok(f"사유 부실 422 ({st})", st == 422)
    st, b = req("POST", "/support/requests", A,
                {"tenantCode": TC, "reason": "견적 오류 재현 지원", "scope": []})
    ok(f"★ 범위 미지정 422 (전체 접근 불가) ({st})", st == 422 and "범위" in (b or {}).get("detail", ""))
    st, b = req("POST", "/support/requests", A,
                {"tenantCode": TC, "reason": "견적 오류 재현 지원", "scope": ["NOPE"]})
    ok(f"알 수 없는 범위 422 ({st})", st == 422)
    st, b = req("POST", "/support/requests", A,
                {"tenantCode": TC, "reason": "견적 오류 재현 지원", "scope": ["PROJECT"], "hours": 999})
    ok(f"기간 범위 초과 422 ({st})", st == 422)

    # ── 승인 전에는 열리지 않는다 ──
    st, b = req("GET", f"/support/tenants/{TC}/summary", A)
    ok(f"★ 승인 없으면 조회 403 ({st})", st == 403 and "승인" in (b or {}).get("detail", ""))

    st, rq = req("POST", "/support/requests", A,
                 {"tenantCode": TC, "reason": "견적 오류 재현 지원", "scope": ["PROJECT", "RUN"], "hours": 2})
    rid = rq["requestId"]
    ok(f"지원 요청 201 (#{rid})", st == 201 and rq["status"] == "REQUESTED")

    # ── 고객사만 결정 ──
    st, b = req("POST", f"/support/requests/{rid}/decide", A, {"approve": True})
    ok(f"★ 운영자 자신은 승인 불가 403 ({st})", st == 403)
    st, d = req("POST", f"/support/requests/{rid}/decide", B, {"approve": True})
    ok(f"★ 고객사 승인 200 — 만료 {d.get('expiresAt')}", st == 200 and d["status"] == "APPROVED")
    st, b = req("POST", f"/support/requests/{rid}/decide", B, {"approve": True})
    ok(f"중복 결정 409 ({st})", st == 409)

    # ── 승인 범위만 조회 + 감사 ──
    st, s = req("GET", f"/support/tenants/{TC}/summary", A)
    ok(f"★ 승인 후 조회 200 (범위 {s.get('scope')})", st == 200 and set(s["scope"]) == {"PROJECT", "RUN"})
    ok("★ 범위 안 항목만 응답", "projects" in s and "runs" in s and "drawings" not in s)
    tid = psql(f"SELECT tenant_id FROM sys_tenant WHERE tenant_code='{TC}'")
    audit = psql(f"SELECT count(*) FROM sys_history WHERE tenant_id={tid} AND action='SUPPORT_READ'")
    ok(f"★ 열람이 고객사 감사에 기록 ({audit}건)", int(audit) >= 1)

    # ── 회수하면 즉시 닫힌다 ──
    st, _ = req("POST", f"/support/requests/{rid}/revoke", B)
    ok(f"고객사 회수 200 ({st})", st == 200)
    st, b = req("GET", f"/support/tenants/{TC}/summary", A)
    ok(f"★ 회수 후 즉시 403 ({st})", st == 403)

    # ── 만료도 닫는다 (과거 시각으로 강제) ──
    st, rq2 = req("POST", "/support/requests", A,
                  {"tenantCode": TC, "reason": "만료 동작 확인", "scope": ["PROJECT"], "hours": 1})
    req("POST", f"/support/requests/{rq2['requestId']}/decide", B, {"approve": True})
    psql(f"UPDATE sys_support_request SET expires_at=now() - interval '1 minute' "
         f"WHERE request_id={rq2['requestId']}")
    st, _ = req("GET", f"/support/tenants/{TC}/summary", A)
    ok(f"★ 만료된 승인은 403 ({st})", st == 403)
    status = psql(f"SELECT status FROM sys_support_request WHERE request_id={rq2['requestId']}")
    ok(f"★ 만료가 상태에 반영 ({status})", status == "EXPIRED")

    # ── #69 이중 승인 ──
    # 자체 패키지를 만들어 게시까지 태운다 — 남의 픽스처에 의존하면 조용히 SKIP 된다
    st, macros = req("GET", "/macros", A)
    mname = macros[0].get("name") or macros[0].get("macroName")
    st, np = req("POST", "/toolbox/packages", A,
                 {"packageCode": "ZSUPPKG", "packageName": "지원 배포 검증"})
    pkg_id = np["packageId"]
    st, _ = req("POST", f"/toolbox/packages/{pkg_id}/items", A,
                {"itemType": "MACRO", "itemRef": mname})
    ok(f"검증용 패키지 구성 ({st})", st == 201)
    for to in ("GUARD", "SANDBOX", "APPROVED", "PUBLISHED"):
        st, _ = req("POST", f"/toolbox/packages/{pkg_id}/transition", A, {"status": to})
        assert st == 200, f"패키지 전이 실패 {to} -> {st}"
    active = {"packageCode": "ZSUPPKG"}
    if True:
        st, sp = req("POST", "/support/packages", A,
                     {"packageCode": active["packageCode"], "tenantCode": TC, "note": "검증"})
        sid = sp["supportPackageId"]
        ok(f"Support Package 등록 201 ({st})", st == 201 and sp["status"] == "DRAFT")
        st, b = req("POST", f"/support/packages/{sid}/approve", B)
        ok(f"★ EDIM 검증 전 고객 승인 409 (순서 강제) ({st})",
           st == 409 and "검증" in (b or {}).get("detail", ""))
        st, _ = req("POST", f"/support/packages/{sid}/verify", A)
        ok(f"EDIM 검증 200 ({st})", st == 200)
        st, b = req("POST", f"/support/packages/{sid}/approve", A)
        ok(f"★ 대상 고객사가 아니면 승인 403 ({st})", st == 403)
        st, r = req("POST", f"/support/packages/{sid}/approve", B)
        ok(f"★ 이중 승인 완료 → PUBLISHED ({st})", st == 200 and r["status"] == "PUBLISHED")
        st, lst = req("GET", "/support/packages", A)
        row = next(x for x in lst if x["supportPackageId"] == sid)
        ok("두 승인 도장 모두 기록", row["edimVerified"] and row["customerApproved"])
finally:
    purge()
    print("정리 — 프로브 테넌트·지원 요청 삭제")

print(f"\nlive_support_access: {n}/{n} PASS")

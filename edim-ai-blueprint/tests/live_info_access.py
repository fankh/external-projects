# -*- coding: utf-8 -*-
"""정보 접근 권한·마스킹 라이브 (1.5) — 요구 #4/#6.

검증: 기본 full(무영향) → 역할 규칙 설정 → 마스킹 반영(단가·원가·거래처) → 다운로드 403
     → 임시 열람 부여로 즉시 해제 → 회수 후 복귀 → 규칙 원복.
정리: 프로브 사용자·규칙·임시부여 psql/API 삭제 내장.
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
PU = "info.probe"
PW = "info1234"
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


def req(method, path, tok, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        payload = resp.read()
        return payload if raw else json.loads(payload or b"null")


def purge():
    psql("DELETE FROM sys_info_access WHERE role_name IN ('GENERAL','SETUP')")
    psql(f"DELETE FROM sys_temp_access WHERE user_id IN (SELECT user_id FROM sys_user WHERE login_id='{PU}')")
    psql(f"DELETE FROM sys_notification WHERE user_id IN (SELECT user_id FROM sys_user WHERE login_id='{PU}')")
    psql(f"DELETE FROM sys_history WHERE actor_id IN (SELECT user_id FROM sys_user WHERE login_id='{PU}')")
    psql(f"DELETE FROM sys_user_role WHERE user_id IN (SELECT user_id FROM sys_user WHERE login_id='{PU}')")
    psql(f"DELETE FROM sys_user WHERE login_id='{PU}'")


purge()
adm = login("edim", "edim")
req("POST", "/users", adm, {"login": PU, "name": "정보접근 프로브", "initialPassword": PW,
                            "department": "QA", "email": "", "level": "GENERAL"})
ptok = login(PU, PW)

try:
    ok("alembic 0031 자동 적용", "0031_info_access" in psql("SELECT version_num FROM alembic_version"))

    # 1) 기본값 full — 도입 무영향
    base_prices = req("GET", "/prices", ptok)
    ok(f"기본 full — 단가 실값 노출 ({len(base_prices)}행)",
       base_prices and isinstance(base_prices[0]["price"], (int, float)))
    meta = req("GET", "/access/info", ptok)
    ok(f"매트릭스 조회 ({len(meta['groups'])}그룹·{len(meta['modes'])}모드)",
       all(meta["mine"][g] == "full" for g in meta["mine"]))

    # 2) 역할 규칙 — GENERAL 단가 masked · 거래처 hidden
    req("PUT", "/access/info", adm, {"roleName": "GENERAL", "infoGroup": "price", "mode": "masked"})
    req("PUT", "/access/info", adm, {"roleName": "GENERAL", "infoGroup": "partner", "mode": "hidden"})
    masked = req("GET", "/prices", ptok)
    ok(f"단가 마스킹 적용 ({masked[0]['price']})",
       isinstance(masked[0]["price"], str) and masked[0]["maskMode"] == "masked")
    ok("거래처 숨김", masked[0]["supplier"] is None)
    ok("관리자는 실값 유지", isinstance(req("GET", "/prices", adm)[0]["price"], (int, float)))

    # 3) 원가 summary — 상세 sections 제거
    req("PUT", "/access/info", adm, {"roleName": "GENERAL", "infoGroup": "cost", "mode": "summary"})
    pcr = req("GET", "/cost/pcr", ptok)
    ok("원가 summary — 상세 제거·금액 비노출",
       pcr and pcr[0]["sections"] == {} and pcr[0]["directCostTotal"] is None)

    # 4) 다운로드 차단 (조회 가능 ≠ Export 가능)
    try:
        req("GET", "/prices/export.xlsx", ptok, raw=True)
        ok("마스킹 사용자 XLSX 403", False)
    except urllib.error.HTTPError as e:
        ok("마스킹 사용자 XLSX 403", e.code == 403)
    ok("관리자 XLSX 정상", req("GET", "/prices/export.xlsx", adm, raw=True)[:2] == b"PK")

    # 5) 임시 열람 — 즉시 해제 후 회수 시 복귀
    g = req("POST", "/access/temp", adm,
            {"login": PU, "infoGroup": "price", "mode": "full", "hours": 2, "reason": "감사 대응 (스위트)"})
    ok(f"임시 열람 부여 (만료 {g['validTo']})", bool(g["id"]))
    ok("임시 열람 중 실값 노출", isinstance(req("GET", "/prices", ptok)[0]["price"], (int, float)))
    ok("임시 열람 중 XLSX 허용", req("GET", "/prices/export.xlsx", ptok, raw=True)[:2] == b"PK")
    req("DELETE", f"/access/temp/{g['id']}", adm)
    ok("회수 후 마스킹 복귀", isinstance(req("GET", "/prices", ptok)[0]["price"], str))

    # 6) 사유 없는 임시 부여 422 · 일반 사용자 설정 403
    try:
        req("POST", "/access/temp", adm, {"login": PU, "infoGroup": "cost", "hours": 1, "reason": ""})
        ok("사유 없는 부여 422", False)
    except urllib.error.HTTPError as e:
        ok("사유 없는 부여 422", e.code == 422)
    try:
        req("PUT", "/access/info", ptok, {"roleName": "GENERAL", "infoGroup": "price", "mode": "full"})
        ok("일반 사용자 규칙 변경 403", False)
    except urllib.error.HTTPError as e:
        ok("일반 사용자 규칙 변경 403", e.code == 403)

    # 7) 원복 — full 지정 시 규칙 삭제
    for grp in ("price", "partner", "cost"):
        req("PUT", "/access/info", adm, {"roleName": "GENERAL", "infoGroup": grp, "mode": "full"})
    ok("full 지정 = 규칙 삭제(기본 복귀)",
       psql("SELECT count(*) FROM sys_info_access WHERE role_name='GENERAL'") == "0"
       and isinstance(req("GET", "/prices", ptok)[0]["price"], (int, float)))
finally:
    purge()
    print("정리 — 규칙·임시부여·프로브 사용자 삭제", flush=True)

print(f"\nlive_info_access: {n}/{n} PASS")

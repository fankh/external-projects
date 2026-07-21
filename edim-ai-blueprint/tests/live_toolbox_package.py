# -*- coding: utf-8 -*-
"""Toolbox Program Package 라이브 (5.6) — 요구 #56(단위·상태기계)·#61(위험도)·#63(버전) 전제.

배경: 사용자 확장이 낱개로 승인·배포돼 배포 단위도, 되돌릴 단위도 없었다.
검증: 생성 → 항목 추가(snapshot 고정) → 빈 패키지 GUARD 차단 → 단계 건너뛰기 422 →
     GUARD→SANDBOX→APPROVED→PUBLISHED → 게시본 구성 변경 409 → 새 버전 생성(항목 복사) →
     CRITICAL 승인 가드 → 없는 항목 422.
정리: ZZPKG* psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
CODE = "ZZPKG1"
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


def cleanup():
    psql("DELETE FROM tbx_package_item WHERE package_id IN "
         f"(SELECT package_id FROM tbx_package WHERE package_code LIKE 'ZZPKG%')")
    psql("DELETE FROM tbx_package WHERE package_code LIKE 'ZZPKG%'")


TOK = login("edim", "edim")
cleanup()

try:
    # ── 생성 ──
    st, b = req("POST", "/toolbox/packages", TOK, {"packageCode": CODE, "packageName": "검증 패키지",
                                                   "riskLevel": "BOGUS"})
    ok(f"위험도 어휘 422 ({st})", st == 422)
    st, pkg = req("POST", "/toolbox/packages", TOK,
                  {"packageCode": CODE, "packageName": "검증 패키지", "riskLevel": "MEDIUM"})
    pid = pkg["packageId"]
    ok(f"패키지 생성 201 — DRAFT v1 ({pid})", st == 201 and pkg["version"] == 1)
    st, _ = req("POST", "/toolbox/packages", TOK, {"packageCode": CODE, "packageName": "중복"})
    ok("중복 코드 v1 409", st == 409)

    # ── 빈 패키지는 GUARD 불가 ──
    st, b = req("POST", f"/toolbox/packages/{pid}/transition", TOK, {"status": "GUARD"})
    ok(f"★ 구성 항목 없으면 GUARD 차단 409 ({st})", st == 409)

    # ── 항목 추가 (snapshot 고정) ──
    st, macros = req("GET", "/macros", TOK)
    mname = macros[0].get("name") or macros[0].get("macroName")
    st, it = req("POST", f"/toolbox/packages/{pid}/items", TOK,
                 {"itemType": "MACRO", "itemRef": mname})
    ok(f"MACRO 항목 추가 201 — {mname}", st == 201)
    st, b = req("POST", f"/toolbox/packages/{pid}/items", TOK,
                {"itemType": "MACRO", "itemRef": mname})
    ok(f"중복 항목 409 ({st})", st == 409)
    st, b = req("POST", f"/toolbox/packages/{pid}/items", TOK,
                {"itemType": "MACRO", "itemRef": "NO_SUCH_MACRO"})
    ok(f"없는 원본 422 ({st})", st == 422)
    st, d = req("GET", f"/toolbox/packages/{pid}", TOK)
    ok("항목 snapshot 고정됨", d["items"] and d["items"][0]["frozen"] is True)
    ok("내용 체크섬 생성", bool(d["checksum"]))

    # ── 상태기계 ──
    st, b = req("POST", f"/toolbox/packages/{pid}/transition", TOK, {"status": "APPROVED"})
    ok(f"★ 단계 건너뛰기 422 (DRAFT→APPROVED) ({st})", st == 422 and "전이" in (b or {}).get("detail", ""))
    for to in ("GUARD", "SANDBOX", "APPROVED", "PUBLISHED"):
        st, _ = req("POST", f"/toolbox/packages/{pid}/transition", TOK, {"status": to, "note": "검증"})
        ok(f"전이 → {to} ({st})", st == 200)
    st, d = req("GET", f"/toolbox/packages/{pid}", TOK)
    ok("guard/sandbox 보고서 기록", d["guardReport"] and d["sandboxReport"])

    # ── 게시본 불변 ──
    st, b = req("POST", f"/toolbox/packages/{pid}/items", TOK,
                {"itemType": "MACRO", "itemRef": mname})
    ok(f"★ 게시본 항목 추가 409 ({st})", st == 409 and "DRAFT" in (b or {}).get("detail", ""))
    iid = d["items"][0]["itemId"]
    st, _ = req("DELETE", f"/toolbox/packages/{pid}/items/{iid}", TOK)
    ok(f"★ 게시본 항목 삭제 409 ({st})", st == 409)

    # ── 새 버전 = 항목 복사한 DRAFT ──
    st, v2 = req("POST", f"/toolbox/packages/{pid}/new-version", TOK)
    ok(f"새 버전 생성 201 — v{v2.get('version')}", st == 201 and v2["version"] == 2
       and v2["status"] == "DRAFT")
    st, d2 = req("GET", f"/toolbox/packages/{v2['packageId']}", TOK)
    ok("새 버전에 구성 항목 복사", len(d2["items"]) == len(d["items"]))
    ok("복사본 체크섬 동일 (같은 내용)", d2["checksum"] == d["checksum"])
    st, _ = req("DELETE", f"/toolbox/packages/{v2['packageId']}/items/{d2['items'][0]['itemId']}", TOK)
    ok(f"새 버전은 DRAFT 라 구성 변경 가능 ({st})", st == 200)

    # ── #61 CRITICAL 승인 가드 (운영 테넌트는 통과) ──
    st, crit = req("POST", "/toolbox/packages", TOK,
                   {"packageCode": "ZZPKGC", "packageName": "위험 패키지", "riskLevel": "CRITICAL"})
    cid = crit["packageId"]
    req("POST", f"/toolbox/packages/{cid}/items", TOK, {"itemType": "MACRO", "itemRef": mname})
    for to in ("GUARD", "SANDBOX"):
        req("POST", f"/toolbox/packages/{cid}/transition", TOK, {"status": to})
    st, _ = req("POST", f"/toolbox/packages/{cid}/transition", TOK, {"status": "APPROVED"})
    ok(f"운영 테넌트는 CRITICAL 승인 가능 ({st})", st == 200)

    # ── 권한 ──
    gtok = login("kim01", "edim")
    st, _ = req("POST", "/toolbox/packages", gtok, {"packageCode": "ZZPKGX", "packageName": "x"})
    ok(f"GENERAL 패키지 생성 403 ({st})", st == 403)
    st, lst = req("GET", "/toolbox/packages", TOK)
    ok(f"목록 조회 ({len(lst)}건)", st == 200 and any(x["packageCode"] == CODE for x in lst))
finally:
    cleanup()
    left = psql("SELECT count(*) FROM tbx_package WHERE package_code LIKE 'ZZPKG%'")
    print(f"정리 — ZZPKG* 삭제 (잔존 {left})")

print(f"\nlive_toolbox_package: {n}/{n} PASS")

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
    psql("DELETE FROM tbx_macro WHERE macro_name IN ('ZZBADMACRO','ZZCODEMACRO','ZZPARSEBAD')")
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
    # 8.9 — APPROVED 는 승인 행위다: APPROVE 동사가 없으면 막힌다(#3)
    # 동사 설정은 API 로 한다 — 손으로 쓴 SQL 은 스키마·테넌트 코드를 틀리기 쉽다(실제로 틀렸다)
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": "approval", "verbs": ["READ"]})
    ok(f"approval 자원에 READ 만 부여 ({st})", st == 200)
    for to in ("GUARD", "SANDBOX"):
        req("POST", f"/toolbox/packages/{pid}/transition", TOK, {"status": to})
    st, b = req("POST", f"/toolbox/packages/{pid}/transition", TOK, {"status": "APPROVED"})
    ok(f"★ APPROVE 동사 없으면 패키지 승인 403 ({st})",
       st == 403 and "APPROVE" in (b or {}).get("detail", ""))
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": "approval", "verbs": []})
    ok(f"동사 설정 제거 ({st})", st == 200)
    st, _ = req("POST", f"/toolbox/packages/{pid}/transition", TOK, {"status": "APPROVED"})
    ok(f"★ 동사 미설정이면 종전대로 승인 통과 ({st})", st == 200)
    for to in ("PUBLISHED",):
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

    # ── #61 Design-time Guard — 정의를 실제로 검사, 위험도 자동 상향 ──
    st, gpkg = req("POST", "/toolbox/packages", TOK,
                   {"packageCode": "ZZPKGG", "packageName": "가드 검증", "riskLevel": "LOW"})
    gid = gpkg["packageId"]
    psql("INSERT INTO tbx_macro (tenant_id, macro_name, macro_expr, code_text, apply_type, status) "
         "SELECT tenant_id, 'ZZCODEMACRO', 'A + B', 'print(1)', 'CODING', 'DRAFT' FROM sys_user "
         "WHERE login_id='edim' LIMIT 1")
    req("POST", f"/toolbox/packages/{gid}/items", TOK,
        {"itemType": "MACRO", "itemRef": "ZZCODEMACRO"})
    st, _ = req("POST", f"/toolbox/packages/{gid}/transition", TOK, {"status": "GUARD"})
    ok(f"CODING 포함 패키지 GUARD 통과 ({st})", st == 200)
    st, dg = req("GET", f"/toolbox/packages/{gid}", TOK)
    ok(f"★ 위험도 자동 상향 LOW → {dg['riskLevel']} (CODING)", dg["riskLevel"] == "HIGH")
    rep = dg.get("guardReport") or {}
    ok("가드 보고서에 발견 내용", rep.get("findings") and rep.get("riskFloor") == "HIGH")
    psql("DELETE FROM tbx_macro WHERE macro_name='ZZCODEMACRO'")

    # 깨진 정의는 GUARD 에서 막힌다
    st, bp = req("POST", "/toolbox/packages", TOK,
                 {"packageCode": "ZZPKGE", "packageName": "파싱 실패"})
    bp_id = bp["packageId"]
    psql("INSERT INTO tbx_macro (tenant_id, macro_name, macro_expr, apply_type, status) "
         "SELECT tenant_id, 'ZZPARSEBAD', '((A + ', 'MACRO', 'DRAFT' FROM sys_user "
         "WHERE login_id='edim' LIMIT 1")
    req("POST", f"/toolbox/packages/{bp_id}/items", TOK,
        {"itemType": "MACRO", "itemRef": "ZZPARSEBAD"})
    st, b = req("POST", f"/toolbox/packages/{bp_id}/transition", TOK, {"status": "GUARD"})
    ok(f"★ 파싱 불가 정의는 GUARD 409 ({st})", st == 409 and "설계시" in (b or {}).get("detail", ""))
    st, dbp = req("GET", f"/toolbox/packages/{bp_id}", TOK)
    ok("★ 실패 패키지는 DRAFT 에 머문다", dbp["status"] == "DRAFT")
    psql("DELETE FROM tbx_macro WHERE macro_name='ZZPARSEBAD'")

    # ── #62 Sandbox 격리 테스트 — 실패하면 배포로 못 간다 ──
    st, badpkg = req("POST", "/toolbox/packages", TOK,
                     {"packageCode": "ZZPKGF", "packageName": "실패 패키지"})
    bad_id = badpkg["packageId"]
    # 문법은 맞지만 **실행하면 실패**하는 수식 — 설계시 검사(#61)는 통과하고
    # 격리 테스트(#62)에서 걸려야 한다(이중 방어의 뒷단)
    psql("INSERT INTO tbx_macro (tenant_id, macro_name, macro_expr, apply_type, status) "
         "SELECT tenant_id, 'ZZBADMACRO', 'SQRT(0 - 1)', 'MACRO', 'DRAFT' FROM sys_user "
         "WHERE login_id='edim' LIMIT 1")
    st, _ = req("POST", f"/toolbox/packages/{bad_id}/items", TOK,
                {"itemType": "MACRO", "itemRef": "ZZBADMACRO"})
    ok(f"깨진 Macro 항목 추가 ({st})", st == 201)
    st, _ = req("POST", f"/toolbox/packages/{bad_id}/transition", TOK, {"status": "GUARD"})
    ok("GUARD 는 통과 (설계시 검사)", st == 200)
    st, b = req("POST", f"/toolbox/packages/{bad_id}/transition", TOK, {"status": "SANDBOX"})
    ok(f"★ Sandbox 실패 시 전이 409 ({st})", st == 409 and "Sandbox" in (b or {}).get("detail", ""))
    st, d_bad = req("GET", f"/toolbox/packages/{bad_id}", TOK)
    ok("★ 실패 패키지는 GUARD 에 머문다 (배포 불가)", d_bad["status"] == "GUARD")
    psql("DELETE FROM tbx_macro WHERE macro_name='ZZBADMACRO'")

    # 정상 패키지는 sandbox_report 에 항목별 결과가 남는다
    st, d_ok = req("GET", f"/toolbox/packages/{pid}", TOK)
    rep = d_ok.get("sandboxReport") or {}
    ok(f"★ Sandbox 보고서에 항목별 결과 (ran {rep.get('ranItems')}·fail {rep.get('failed')})",
       rep.get("ranItems", 0) >= 1 and rep.get("failed") == 0 and rep.get("results"))

    # ── #63 Runtime 연결·Rollback ──
    st, rt = req("GET", "/toolbox/runtime", TOK)
    ok(f"Runtime 조회 200 ({len(rt)}개 활성)", st == 200)
    active = [x for x in rt if x["packageCode"] == CODE]
    ok(f"★ 게시본이 Runtime 에 연결 (v{active[0]['version'] if active else '-'})",
       active and active[0]["version"] == 1)
    ok("Runtime 이 구성 항목까지 노출", active and active[0]["items"])
    ok("★ Runtime 무결성 intact=true", active and active[0]["intact"] is True)

    # v2 를 게시하면 활성이 v2 로 넘어가고 v1 은 PUBLISHED 로 남는다
    v2id = v2["packageId"]
    req("POST", f"/toolbox/packages/{v2id}/items", TOK, {"itemType": "MACRO", "itemRef": mname})
    for to in ("GUARD", "SANDBOX", "APPROVED", "PUBLISHED"):
        req("POST", f"/toolbox/packages/{v2id}/transition", TOK, {"status": to})
    st, rt2 = req("GET", "/toolbox/runtime", TOK)
    act2 = [x for x in rt2 if x["packageCode"] == CODE]
    ok(f"★ v2 게시 후 활성은 v2 ({act2[0]['version'] if act2 else '-'})",
       act2 and act2[0]["version"] == 2)
    ok("★ 코드당 활성은 하나뿐", len(act2) == 1)
    st, d1 = req("GET", f"/toolbox/packages/{pid}", TOK)
    ok("v1 은 PUBLISHED 로 남고 비활성", d1["status"] == "PUBLISHED" and d1["active"] is False)

    # Rollback — 활성 포인터만 v1 로
    st, rb = req("POST", f"/toolbox/packages/{pid}/rollback", TOK)
    ok(f"★ Rollback 200 — v{rb.get('activeVersion')} (이전 v{rb.get('previousVersion')})",
       st == 200 and rb["activeVersion"] == 1 and rb["previousVersion"] == 2)
    st, rt3 = req("GET", "/toolbox/runtime", TOK)
    act3 = [x for x in rt3 if x["packageCode"] == CODE]
    ok("Rollback 후 Runtime 이 v1", act3 and act3[0]["version"] == 1)
    st, d2b = req("GET", f"/toolbox/packages/{v2id}", TOK)
    ok("되돌려도 v2 이력은 PUBLISHED 로 보존", d2b["status"] == "PUBLISHED")
    st, b = req("POST", f"/toolbox/packages/{pid}/rollback", TOK)
    ok(f"이미 활성이면 409 ({st})", st == 409)

    st, draft = req("POST", "/toolbox/packages", TOK,
                    {"packageCode": "ZZPKGD", "packageName": "드래프트"})
    st, b = req("POST", f"/toolbox/packages/{draft['packageId']}/rollback", TOK)
    ok(f"★ 게시 이력 없는 버전 Rollback 409 ({st})", st == 409)

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

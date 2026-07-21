# -*- coding: utf-8 -*-
"""Template Library 라이브 (6.4) — 요구 #57 "읽기전용→Tenant 복사·Lock·원본 영향분석".

배경: tbx_templet 에 is_system 만 있고 원본/사본 관계가 없어 계보·영향분석·부분 Lock 이 전부 불가였다.
검증: 원본 지정 → 원본 편집 409 → 복사(계보 기록) → 사본 편집 가능 → 잠긴 필드 수정 409 →
     영향분석에 사본 노출 → 이름 중복 409.
정리: ZZTPL* psql 삭제, 원본 표시 원복.
"""
import json
import subprocess
import urllib.error
import urllib.request
from urllib.parse import quote

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
SRC = "ZZTPL-LIB"
CLONE = "ZZTPL-COPY"
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
    r = urllib.request.Request(API + quote(path, safe="/?=&%"), data=data, method=method,
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
    psql(f"DELETE FROM tbx_templet WHERE templet_name LIKE 'ZZTPL%'")


TOK = login("edim", "edim")
cleanup()

try:
    # ── 라이브러리 원본 준비 (is_system + 잠금 필드 지정) ──
    st, _ = req("PUT", f"/toolbox/templets/{SRC}", TOK,
                {"templetType": "DATA", "definition": {"title": "원본", "layout": "A", "brand": "EDIM"}})
    ok(f"원본 Templet 생성 ({st})", st == 200)
    psql(f"UPDATE tbx_templet SET is_system=true, locked_fields='[\\\"brand\\\"]'::jsonb "
         f"WHERE templet_name='{SRC}'")

    st, lst = req("GET", "/toolbox/templets", TOK)
    src = next(t for t in lst if t["name"] == SRC)
    ok("목록에 라이브러리 표시·잠금 필드 노출",
       src["system"] is True and src["lockedFields"] == ["brand"])

    # ── 원본은 읽기 전용 ──
    st, b = req("PUT", f"/toolbox/templets/{SRC}", TOK,
                {"templetType": "DATA", "definition": {"title": "원본 수정 시도"}})
    ok(f"★ 원본 편집 409 ({st})", st == 409 and "복사" in (b or {}).get("detail", ""))

    # ── 복사 (계보 기록) ──
    st, cl = req("POST", f"/toolbox/templets/{SRC}/clone", TOK, {"newName": CLONE})
    ok(f"★ 복사 201 — 계보 {cl.get('origin')}", st == 201 and cl["origin"] == SRC)
    ok("사본은 원본의 잠금을 물려받는다", cl["lockedFields"] == ["brand"])
    st, b = req("POST", f"/toolbox/templets/{SRC}/clone", TOK, {"newName": CLONE})
    ok(f"이름 중복 409 ({st})", st == 409)
    st, b = req("POST", "/toolbox/templets/NO_SUCH/clone", TOK, {"newName": "ZZTPL-X"})
    ok(f"없는 원본 404 ({st})", st == 404)

    # ── 사본 편집: 잠기지 않은 필드는 가능 ──
    st, _ = req("PUT", f"/toolbox/templets/{CLONE}", TOK,
                {"templetType": "DATA", "definition": {"title": "사본 수정", "layout": "B", "brand": "EDIM"}})
    ok(f"★ 사본의 비잠금 필드 수정 200 ({st})", st == 200)

    # ── 잠긴 필드는 막힌다 ──
    st, b = req("PUT", f"/toolbox/templets/{CLONE}", TOK,
                {"templetType": "DATA", "definition": {"title": "사본 수정", "layout": "B", "brand": "OTHER"}})
    ok(f"★ 잠긴 필드 수정 409 ({st})", st == 409 and "brand" in (b or {}).get("detail", ""))

    # ── 원본 영향분석 ──
    st, imp = req("GET", f"/toolbox/templets/{SRC}/impact", TOK)
    ok(f"★ 영향분석 — 사본 {imp.get('cloneCount')}건", st == 200 and imp["cloneCount"] == 1)
    ok("영향분석에 사본 이름", any(c["name"] == CLONE for c in imp["clones"]))
    ok("원본은 라이브러리로 표기", imp["isLibrary"] is True)
    st, imp2 = req("GET", f"/toolbox/templets/{CLONE}/impact", TOK)
    ok("사본의 파생은 0건", imp2["cloneCount"] == 0 and imp2["isLibrary"] is False)

    # ── 권한 ──
    gtok = login("kim01", "edim")
    st, _ = req("POST", f"/toolbox/templets/{SRC}/clone", gtok, {"newName": "ZZTPL-G"})
    ok(f"GENERAL 복사 403 ({st})", st == 403)
finally:
    cleanup()
    left = psql("SELECT count(*) FROM tbx_templet WHERE templet_name LIKE 'ZZTPL%'")
    print(f"정리 — ZZTPL* 삭제 (잔존 {left})")

print(f"\nlive_templet_library: {n}/{n} PASS")

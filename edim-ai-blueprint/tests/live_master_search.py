# -*- coding: utf-8 -*-
"""마스터 대장 서버측 검색 라이브 (9.23) — /parts·/companies q 파라미터.

배경: 부품·거래처 대장이 전 행을 반환하고 클라이언트 검색도 없어, 대량 카탈로그에서
항목을 찾을 수 없고 렌더 부담이 크다. 추가형 q(부분일치, 미지정 시 종전 동작) 를 서버측에
도입해 필터된 행만 받아오게 한다. 이 스위트는 q 가 실제로 좁히고(부분일치·대소문자 무관),
무매칭은 0행, 미지정은 전량임을 검증한다.
"""
import json
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login", data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


TOK = login("edim", "edim")


def get(path):
    r = urllib.request.Request(API + path, method="GET",
                               headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read() or b"[]")


# ── /parts ──
full = get("/parts")
ok(f"/parts 전량 조회 ({len(full)}행)", isinstance(full, list))
none = get("/parts?q=" + urllib.parse.quote("ZZZNOMATCHXYZ"))
ok("★ /parts 무매칭 검색 0행", none == [])
if full:
    p = full[0]
    frag = (p["partNo"] or p["name"] or "")[:3]
    if frag:
        res = get("/parts?q=" + urllib.parse.quote(frag))
        ok(f"★ /parts q='{frag}' 결과 존재·전량 이하 ({len(res)}≤{len(full)})",
           1 <= len(res) <= len(full))
        ok(f"★ /parts q='{frag}' 전 행이 부분일치(대소문자 무관)",
           all(frag.lower() in (r["partNo"] + " " + (r["name"] or "") + " " + (r["spec"] or "")).lower()
               for r in res))
        # 대소문자 무관 확인
        res_up = get("/parts?q=" + urllib.parse.quote(frag.upper()))
        ok("★ /parts 대문자 검색도 동일 결과", len(res_up) == len(res))

# ── /companies ──
cfull = get("/companies")
ok(f"/companies 전량 조회 ({len(cfull)}행)", isinstance(cfull, list))
cnone = get("/companies?q=" + urllib.parse.quote("ZZZNOMATCHXYZ"))
ok("★ /companies 무매칭 검색 0행", cnone == [])
if cfull:
    frag = (cfull[0]["name"] or "")[:3]
    if frag:
        cres = get("/companies?q=" + urllib.parse.quote(frag))
        ok(f"★ /companies q='{frag}' 결과 존재·전량 이하 ({len(cres)}≤{len(cfull)})",
           1 <= len(cres) <= len(cfull))
        ok(f"★ /companies q='{frag}' 전 행이 부분일치",
           all(frag.lower() in (r["name"] + " " + (r["remarks"] or "")).lower() for r in cres))

# active_only 와 q 동시 사용 (파라미터 결합 무결)
combo = get("/companies?active_only=true&q=" + urllib.parse.quote("a"))
ok(f"/companies active_only+q 결합 정상 ({len(combo)}행)", isinstance(combo, list))

# ── LIKE 메타문자 이스케이프 (9.29) — %·_ 는 리터럴이어야 함 ──
# 미이스케이프면 % 가 와일드카드로 전량 매칭. 이스케이프 후엔 리터럴 '%' 포함 행만(대개 0).
pct = get("/parts?q=" + urllib.parse.quote("%"))
ok(f"★ /parts q='%' 는 와일드카드 아님 (전량 {len(full)} 아닌 {len(pct)})",
   len(full) < 2 or len(pct) < len(full))
und = get("/parts?q=" + urllib.parse.quote("_"))
ok(f"★ /parts q='_' 는 와일드카드 아님 ({len(und)}행 ≠ 전량 {len(full)})",
   len(full) < 2 or len(und) < len(full))
cpct = get("/companies?q=" + urllib.parse.quote("%"))
ok(f"★ /companies q='%' 는 와일드카드 아님 ({len(cpct)} vs 전량 {len(cfull)})",
   len(cfull) < 2 or len(cpct) < len(cfull))

# ── /materials (9.23 확장) ──
mfull = get("/materials")
ok(f"/materials 전량 조회 ({len(mfull)}행)", isinstance(mfull, list))
ok("★ /materials 무매칭 검색 0행", get("/materials?q=ZZZNOMATCHXYZ") == [])
if mfull:
    frag = (mfull[0]["code"] or mfull[0]["name"] or "")[:2]
    if frag:
        mres = get("/materials?q=" + urllib.parse.quote(frag))
        ok(f"★ /materials q='{frag}' 결과 존재·전량 이하 ({len(mres)}≤{len(mfull)})",
           1 <= len(mres) <= len(mfull))
        ok("★ /materials 전 행이 부분일치",
           all(frag.lower() in (r["code"] + " " + (r["name"] or "")).lower() for r in mres))

# ── /drawings (9.23 확장 — code 정확일치와 별개 q 퍼지) ──
dfull = get("/drawings")
ok(f"/drawings 전량 조회 ({len(dfull)}행)", isinstance(dfull, list))
ok("★ /drawings 무매칭 검색 0행", get("/drawings?q=ZZZNOMATCHXYZ") == [])
if dfull:
    frag = (dfull[0]["drawingNo"] or "")[:3]
    if frag:
        dres = get("/drawings?q=" + urllib.parse.quote(frag))
        ok(f"★ /drawings q='{frag}' 결과 존재·전량 이하 ({len(dres)}≤{len(dfull)})",
           1 <= len(dres) <= len(dfull))

# ── /codes/products (9.25 확장 — status 필터와 별개 q) ──
pfull = get("/codes/products")
ok(f"/codes/products 전량 조회 ({len(pfull)}행)", isinstance(pfull, list))
ok("★ /codes/products 무매칭 검색 0행", get("/codes/products?q=ZZZNOMATCHXYZ") == [])
if pfull:
    frag = (pfull[0]["mainCode"] or "")[:3]
    if frag:
        pres = get("/codes/products?q=" + urllib.parse.quote(frag))
        ok(f"★ /codes/products q='{frag}' 결과 존재·전량 이하 ({len(pres)}≤{len(pfull)})",
           1 <= len(pres) <= len(pfull))
        ok("★ /codes/products 전 행이 부분일치",
           all(frag.lower() in (r["mainCode"] + " " + (r["codeName"] or "")).lower() for r in pres))

# ── 트랜잭션 그리드 검색 (9.30) — 작업지시·검사·설계변경 ──
for path, key in [("/erp/work-orders", "woNo"), ("/qc/inspections", "inspNo"), ("/eco/changes", "ecoNo"),
                  ("/erp/pos", "poNo"), ("/cost/actuals", "category")]:
    tfull = get(path)
    ok(f"{path} 전량 조회 ({len(tfull)}행)", isinstance(tfull, list))
    ok(f"★ {path} 무매칭 검색 0행", get(f"{path}?q=ZZZNOMATCHXYZ") == [])
    if tfull:
        frag = (tfull[0][key] or "")[:3]
        if frag:
            tres = get(f"{path}?q=" + urllib.parse.quote(frag))
            ok(f"★ {path} q='{frag}' 결과 존재·전량 이하 ({len(tres)}≤{len(tfull)})",
               1 <= len(tres) <= len(tfull))
    # % 는 리터럴(와일드카드 아님)
    ok(f"★ {path} q='%' 와일드카드 아님",
       len(tfull) < 2 or len(get(f"{path}?q=%25")) < len(tfull))

print(f"\nlive_master_search: {n}/{n} PASS")

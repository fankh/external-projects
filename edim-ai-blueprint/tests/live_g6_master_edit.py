# -*- coding: utf-8 -*-
"""G6 라이브 — 마스터 수정 갭: 프로젝트 메타(명/고객/납기) 수정 + 거래처 비활성.

API 계약 검증 (edim.seekerslab.com):
  프로젝트 — PATCH /projects/{no} 로 명·고객·납기 동시 수정(단계 미지정),
             D9 낙관적 잠금 stale→409, 잘못된 납기→422, PROJECT_UPDATE 이력.
  거래처   — PUT /companies/{id} active=false 소프트 비활성 → isActive=false,
             active_only=true 목록서 제외 → active=true 재활성 → 복원.
실행: PYTHONUTF8=1 py tests/live_g6_master_edit.py
정리: 생성한 테스트 프로젝트 DELETE + 잔여(고객사/거래처) psql 정리 안내(끝에 출력).
"""
import json
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def req(method, path, body=None, tok=None):
    """(status, json|None) 반환 — 4xx/5xx 도 예외 없이 상태코드로 반환."""
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if tok:
        r.add_header("Authorization", f"Bearer {tok}")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read() or "null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or "null")
        except Exception:
            return e.code, None


# ── 로그인 ──
st, tok_body = req("POST", "/auth/login", {"userId": "edim", "password": "edim"})
tok = tok_body.get("token") if tok_body else None
ok("로그인", st == 200 and tok)

SUFFIX = "E2E_MASTER_EDIT"

# ── 1. 프로젝트 메타 수정 ──
st, created = req("POST", "/projects", {
    "projectName": f"ZZ_{SUFFIX}_orig", "projectType": "Client", "item": "AHU",
    "client": f"ZZ_{SUFFIX}_cust1", "clientContact": "홍길동"}, tok)
ok("프로젝트 생성(207 자동채번)", st == 201 and created.get("projectNo"))
pno = created["projectNo"]

st, det = req("GET", f"/projects/{pno}", tok=tok)
base_ver = det.get("updatedAt", "") if det else ""
ok("프로젝트 상세 — D9 버전 토큰", st == 200)

# 명/고객/납기 동시 수정 (단계 미지정)
st, res = req("PATCH", f"/projects/{pno}", {
    "projectName": f"ZZ_{SUFFIX}_renamed", "client": f"ZZ_{SUFFIX}_cust2",
    "dueDate": "2026-09-30", "baseUpdatedAt": base_ver}, tok)
ok("메타 수정 200 (명/고객/납기)", st == 200)
ok("응답 updated = client/dueDate/projectName",
   set(res.get("updated", [])) == {"client", "dueDate", "projectName"})

# 목록서 반영 확인
st, lst = req("GET", "/projects", tok=tok)
row = next((p for p in lst if p["projectNo"] == pno), None)
ok("목록 반영 — 명 변경", row and row["projectName"] == f"ZZ_{SUFFIX}_renamed")
ok("목록 반영 — 고객 변경", row and row["client"] == f"ZZ_{SUFFIX}_cust2")
ok("목록 반영 — 납기 2026-09-30", row and row["dueDate"] == "2026-09-30")

# D9 — stale 토큰으로 재수정 시 409
st, _ = req("PATCH", f"/projects/{pno}", {
    "projectName": f"ZZ_{SUFFIX}_conflict", "baseUpdatedAt": base_ver}, tok)
ok("stale baseUpdatedAt → 409 (동시편집 충돌)", st == 409)

# 잘못된 납기 → 422
st, _ = req("PATCH", f"/projects/{pno}", {"dueDate": "notadate"}, tok)
ok("잘못된 납기 형식 → 422", st == 422)

# 빈 프로젝트명 → 422
st, _ = req("PATCH", f"/projects/{pno}", {"projectName": "   "}, tok)
ok("빈 프로젝트명 → 422", st == 422)

# 정리 — 테스트 프로젝트 삭제 (기술 제안·무참조)
st, _ = req("DELETE", f"/projects/{pno}", tok=tok)
ok("테스트 프로젝트 정리(DELETE 200)", st == 200)

# ── 2. 거래처 비활성 ──
cname = f"ZZ_{SUFFIX}_supplier"
st, _ = req("POST", "/companies", {"name": cname, "companyType": "SUPPLIER", "nation": "KR"}, tok)
ok("거래처 생성", st == 201)

st, comps = req("GET", "/companies", tok=tok)
c = next((x for x in comps if x["name"] == cname), None)
ok("거래처 생성 직후 isActive=true", c and c.get("isActive") is True)
cid = c["companyId"]

# 비활성
st, _ = req("PUT", f"/companies/{cid}", {"active": False}, tok)
ok("비활성 PUT 200", st == 200)
st, comps = req("GET", "/companies", tok=tok)
c = next((x for x in comps if x["companyId"] == cid), None)
ok("전체 목록엔 남되 isActive=false", c and c.get("isActive") is False)

# active_only 목록서 제외
st, active = req("GET", "/companies?active_only=true", tok=tok)
ok("active_only=true 목록서 제외", all(x["companyId"] != cid for x in active))

# 재활성
st, _ = req("PUT", f"/companies/{cid}", {"active": True}, tok)
ok("재활성 PUT 200", st == 200)
st, active = req("GET", "/companies?active_only=true", tok=tok)
ok("재활성 후 active_only 목록 복귀", any(x["companyId"] == cid for x in active))

print(f"\nOK — live_g6_master_edit {n}/{n}")
print(f"\n정리 SQL (거래처·자동생성 고객사 잔여):")
print(f"  DELETE FROM com_company WHERE company_name LIKE 'ZZ_{SUFFIX}_%';")

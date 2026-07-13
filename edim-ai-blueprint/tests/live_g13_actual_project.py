# -*- coding: utf-8 -*-
"""G13 라이브 — 원가 실적 프로젝트 귀속 + 프로젝트별 차이분석 (D6).

API 계약 (edim.seekerslab.com):
  POST /cost/actuals projectNo(존재검증 404)·GET /cost/actuals?project= 필터,
  GET /cost/variance?project= 실적/추정 프로젝트 스코프.
실행: PYTHONUTF8=1 py tests/live_g13_actual_project.py
정리: 생성한 실적(psql)·테스트 프로젝트(API DELETE).
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


st, tb = req("POST", "/auth/login", {"userId": "edim", "password": "edim"})
tok = tb.get("token") if tb else None
ok("로그인", st == 200 and tok)

# 테스트 프로젝트 생성
st, pj = req("POST", "/projects", {"projectName": "ZZ_E2E_ACTUAL", "projectType": "Client"}, tok)
ok("테스트 프로젝트 생성", st == 201 and pj.get("projectNo"))
pno = pj["projectNo"]
TAG = "ZZE2E_ACTUAL"


def rec(cat, qty, up, project=""):
    body = {"category": cat, "itemName": TAG, "qty": qty, "unitPrice": up}
    if project:
        body["projectNo"] = project
    return req("POST", "/cost/actuals", body, tok)


# 귀속 실적 2건 + 미귀속 1건
st, r1 = rec("MATERIAL", 2, 1000, pno)
ok("귀속 실적 MATERIAL 2000", st == 201 and r1["amount"] == 2000 and r1["projectNo"] == pno)
st, r2 = rec("DIRECT", 1, 500, pno)
ok("귀속 실적 DIRECT 500", st == 201 and r2["amount"] == 500)
st, r3 = rec("MATERIAL", 1, 100, "")   # 미귀속
ok("미귀속 실적 100", st == 201 and r3.get("projectNo") in (None, ""))

# 존재하지 않는 프로젝트 → 404
st, _ = rec("MATERIAL", 1, 1, "PS-NONEXIST-ZZZ")
ok("없는 프로젝트 귀속 → 404", st == 404)
# 잘못된 분류 → 422
st, _ = req("POST", "/cost/actuals", {"category": "BOGUS", "qty": 1, "unitPrice": 1}, tok)
ok("잘못된 분류 → 422", st == 422)

# 목록 필터
st, mine = req("GET", f"/cost/actuals?project={pno}", tok=tok)
ok("project 필터 — 귀속분 2건", len(mine) == 2 and all(a["projectNo"] == pno for a in mine))
st, allrows = req("GET", "/cost/actuals", tok=tok)
tagged = [a for a in allrows if a["itemName"] == TAG]
ok("전체 목록 — 미귀속 포함(3건)", len(tagged) == 3)

# 프로젝트 스코프 차이분석
st, v = req("GET", f"/cost/variance?project={pno}", tok=tok)
ok("차이분석 projectNo 반영", v.get("projectNo") == pno)
ok("프로젝트 실적 합계 = 2500 (미귀속 제외)", v["totalActual"] == 2500)
mat = next((c for c in v["categories"] if c["category"] == "MATERIAL"), None)
dr = next((c for c in v["categories"] if c["category"] == "DIRECT"), None)
ok("MATERIAL 실적 2000", mat and mat["actual"] == 2000)
ok("DIRECT 실적 500", dr and dr["actual"] == 500)

# 정리
req("DELETE", f"/projects/{pno}", tok=tok)   # 실적은 FK 아니므로 프로젝트 삭제 가능

print(f"\nOK — live_g13_actual_project {n}/{n}")
print("\n정리 SQL (실적):")
print(f"  DELETE FROM cst_actual WHERE item_name='{TAG}';")

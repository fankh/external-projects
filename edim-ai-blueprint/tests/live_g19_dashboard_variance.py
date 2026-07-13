# -*- coding: utf-8 -*-
"""G19 라이브 — C3 Dashboard 견적 vs 실적 차이 위젯.

API 계약 (edim.seekerslab.com):
  GET /erp/analytics 의 variance 블록(분류별 추정=Run·실적=cst_actual·차이·차이율·경보·hasActual),
  실적 적재 시 위젯 값 재반영.
실행: PYTHONUTF8=1 py tests/live_g19_dashboard_variance.py
정리: 생성한 실적 psql 삭제(끝).
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


def variance():
    st, a = req("GET", "/erp/analytics", tok=tok)
    return a.get("variance")


v0 = variance()
ok("analytics.variance 블록 존재", v0 is not None and "categories" in v0)
ok("분류 3종(재료·제조·직접)", len(v0["categories"]) == 3
   and {c["category"] for c in v0["categories"]} == {"MATERIAL", "MANUFACTURING", "DIRECT"})
ok("총계 필드", all(k in v0 for k in ("totalEstimate", "totalActual", "totalVariance", "alert", "hasActual")))
ok("총 차이 = 총 실적 - 총 추정", abs(v0["totalVariance"] - (v0["totalActual"] - v0["totalEstimate"])) < 1)
base_actual = v0["totalActual"]
base_mat = next(c["actual"] for c in v0["categories"] if c["category"] == "MATERIAL")

# 실적 적재 → 위젯 반영
ADD = 3_000_000
st, r = req("POST", "/cost/actuals", {"category": "MATERIAL", "itemName": "ZZE2E_DASH", "qty": 1, "unitPrice": ADD}, tok)
ok("실적 3,000,000 적재", st == 201 and r["amount"] == ADD)

v1 = variance()
ok("hasActual=true", v1["hasActual"] is True)
ok("총 실적 = 베이스 + 3,000,000", abs(v1["totalActual"] - (base_actual + ADD)) < 1)
mat1 = next(c["actual"] for c in v1["categories"] if c["category"] == "MATERIAL")
ok("MATERIAL 실적 = 베이스 + 3,000,000", abs(mat1 - (base_mat + ADD)) < 1)
ok("총 차이 재계산 = 총 실적 - 총 추정", abs(v1["totalVariance"] - (v1["totalActual"] - v1["totalEstimate"])) < 1)

print(f"\nOK — live_g19_dashboard_variance {n}/{n}")
print("\n정리 SQL:")
print("  DELETE FROM cst_actual WHERE item_name='ZZE2E_DASH';")

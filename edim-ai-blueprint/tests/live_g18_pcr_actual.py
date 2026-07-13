# -*- coding: utf-8 -*-
"""G18 라이브 — 실적→PCR 반영 재계산 (D6).

API 계약 (edim.seekerslab.com):
  GET /cost/pcr/{id}/actual → 매출 고정·직접비를 실적(프로젝트 귀속)으로 치환한
  기여마진·EBIT 재산출 + 추정 대비 차이. 실적 적재 시 재계산 반영.
실행: PYTHONUTF8=1 py tests/live_g18_pcr_actual.py
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

# PCR 확보 (없으면 생성)
st, plist = req("GET", "/cost/pcr", tok=tok)
if not plist:
    req("POST", "/cost/pcr", {"businessType": "PRE_SALES", "marginRate": 0.35}, tok)
    st, plist = req("GET", "/cost/pcr", tok=tok)
ok("PCR 존재", bool(plist))
pid = plist[0]["pcrId"]

# 베이스라인 재계산
st, b = req("GET", f"/cost/pcr/{pid}/actual", tok=tok)
ok("PCR actual 200 · 구조", st == 200 and "estimate" in b and "actual" in b and "variance" in b)
revenue, sga = b["revenue"], b["sga"]
est_margin = b["estimate"]["margin"]
base_direct = b["actual"]["directCost"]
proj = b["projectNo"]
ok("PCR 프로젝트 귀속 확인", bool(proj))
# 실적 마진 = 매출 - 실적 직접비 (항등)
ok("actual.margin = revenue - actual.directCost",
   abs(b["actual"]["margin"] - (revenue - base_direct)) < 1)
ok("actual.ebit = actual.margin - sga",
   abs(b["actual"]["ebit"] - (b["actual"]["margin"] - sga)) < 1)

# 실적 적재 (PCR 프로젝트 귀속)
ADD = 5_000_000
st, r = req("POST", "/cost/actuals",
            {"category": "MATERIAL", "itemName": "ZZE2E_PCR", "qty": 1, "unitPrice": ADD, "projectNo": proj}, tok)
ok("실적 5,000,000 적재(프로젝트 귀속)", st == 201 and r["amount"] == ADD)

# 재계산 반영
st, a = req("GET", f"/cost/pcr/{pid}/actual", tok=tok)
ok("실적 적재 후 actualAvailable=true", a["actualAvailable"] is True and a["actualCount"] >= 1)
ok("직접비 = 베이스 + 5,000,000", abs(a["actual"]["directCost"] - (base_direct + ADD)) < 1)
ok("기여마진 = 매출 - 신규 직접비",
   abs(a["actual"]["margin"] - (revenue - (base_direct + ADD))) < 1)
ok("EBIT = 기여마진 - SGA",
   abs(a["actual"]["ebit"] - (a["actual"]["margin"] - sga)) < 1)
ok("차이(기여마진) = 실적마진 - 추정마진",
   abs(a["variance"]["margin"] - (a["actual"]["margin"] - est_margin)) < 1)

# 404
st, _ = req("GET", "/cost/pcr/999999/actual", tok=tok)
ok("없는 PCR → 404", st == 404)

print(f"\nOK — live_g18_pcr_actual {n}/{n}")
print("\n정리 SQL:")
print("  DELETE FROM cst_actual WHERE item_name='ZZE2E_PCR';")

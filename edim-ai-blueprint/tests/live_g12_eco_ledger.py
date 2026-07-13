# -*- coding: utf-8 -*-
"""G12 라이브 — 변경 이력 대장 전용 뷰 (D-5L).

API 계약 (edim.seekerslab.com):
  GET /eco/ledger → {summary(총/적용/진행/반려), rows(라이프사이클·변경유형 파생·Rev 전이)},
  status/targetType 필터, SUBMITTED=진행·revTransition '—'.
실행: PYTHONUTF8=1 py tests/live_g12_eco_ledger.py
정리: 생성한 ECR(eco_change+sys_approval_request) psql 삭제 안내(끝).
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

# 베이스라인
st, base = req("GET", "/eco/ledger", tok=tok)
ok("대장 200 · summary 구조", st == 200 and set(base["summary"]) == {"total", "applied", "pending", "rejected"})
t0 = base["summary"]["total"]
p0 = base["summary"]["pending"]

# ECR 등록 (도면 대상)
st, c = req("POST", "/eco/changes",
            {"title": "ZZ E2E 변경이력 테스트", "targetType": "DRAWING", "targetNo": "KDCR 3-13", "reason": "E2E 대장 검증"}, tok)
ok("ECR 등록 201", st == 201 and c.get("ecoNo"))
eco_no = c["ecoNo"]

# 대장 반영
st, d = req("GET", "/eco/ledger", tok=tok)
ok("대장 총계 +1", d["summary"]["total"] == t0 + 1)
ok("진행(pending) +1", d["summary"]["pending"] == p0 + 1)
row = next((r for r in d["rows"] if r["ecoNo"] == eco_no), None)
ok("등록 ECR 대장에 표시", row is not None)
ok("변경유형 = 진행 (SUBMITTED)", row["changeType"] == "진행")
ok("상태 SUBMITTED", row["status"] == "SUBMITTED")
ok("Rev 전이 '—' (미적용)", row["revTransition"] == "—")
ok("대상 도면·KDCR 3-13", row["targetType"] == "DRAWING" and row["targetNo"] == "KDCR 3-13")

# 필터
st, f1 = req("GET", "/eco/ledger?status=SUBMITTED", tok=tok)
ok("status=SUBMITTED 필터 — 포함", any(r["ecoNo"] == eco_no for r in f1["rows"]))
st, f2 = req("GET", "/eco/ledger?status=APPLIED", tok=tok)
ok("status=APPLIED 필터 — 제외", all(r["ecoNo"] != eco_no for r in f2["rows"]))
st, f3 = req("GET", "/eco/ledger?targetType=CODE", tok=tok)
ok("targetType=CODE 필터 — 제외(도면 ECR)", all(r["ecoNo"] != eco_no for r in f3["rows"]))
ok("필터 결과 전 행 SUBMITTED", all(r["status"] == "SUBMITTED" for r in f1["rows"]))

print(f"\nOK — live_g12_eco_ledger {n}/{n}")
print(f"\n정리 SQL (ECR {eco_no}):")
print(f"  DELETE FROM sys_approval_request WHERE target_table='eco_change' "
      f"AND target_id IN (SELECT eco_id FROM eco_change WHERE eco_no='{eco_no}');")
print(f"  DELETE FROM eco_change WHERE eco_no='{eco_no}';")

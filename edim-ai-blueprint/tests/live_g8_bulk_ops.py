# -*- coding: utf-8 -*-
"""G8 라이브 — 그리드 다중 선택 일괄 작업 (제품코드 상태/삭제 · 거래처 활성 토글).

API 계약 (edim.seekerslab.com):
  제품코드 — POST /codes/products/batch STATUS(일괄 상태변경)·DELETE(참조 skip 사유),
             빈 대상 422·잘못된 action/status 422.
  거래처   — POST /companies/batch(is_active 일괄 토글) → active_only 반영.
실행: PYTHONUTF8=1 py tests/live_g8_bulk_ops.py
정리: 테스트 제품코드는 batch DELETE 로 자동 정리 · 거래처는 psql 안내(끝).
"""
import json
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com/api/v1"
GROUP = "KOF"
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

# #28 — Slot(Sub Code) 이 정의된 그룹은 자유텍스트 생성이 막힌다(조합 생성 전용).
# 이 스위트는 일괄 작업 검증이 목적이라 수기 등록이 가능한 Slot 미정의 그룹을 쓴다.
_st, _groups = req("GET", "/codes/groups", tok=tok)
_manual = [g["groupCode"] for g in _groups if g["slotCount"] == 0]
assert _manual, "Slot 미정의 그룹 없음 — 시드 GEN 확인"
GROUP = _manual[0]

SFX = "ZZE2EBULK"

# ── 제품코드 일괄 작업 ──
ids = []
for i in range(3):
    st, _ = req("POST", "/codes/products",
                {"mainCode": f"{SFX}-{i}", "codeName": f"일괄테스트{i}", "groupCode": GROUP}, tok)
    assert st == 201, f"create {i} -> {st}"
st, lst = req("GET", "/codes/products?status=DRAFT", tok=tok)
ids = [r["productCodeId"] for r in lst if r["mainCode"].startswith(SFX)]
ok("테스트 제품코드 3건 생성(DRAFT)", len(ids) == 3)

# 빈 대상 → 422
st, _ = req("POST", "/codes/products/batch", {"ids": [], "action": "STATUS", "status": "APPROVED"}, tok)
ok("빈 대상 → 422", st == 422)
# 잘못된 action → 422
st, _ = req("POST", "/codes/products/batch", {"ids": ids, "action": "FOO"}, tok)
ok("잘못된 action → 422", st == 422)
# 잘못된 status → 422
st, _ = req("POST", "/codes/products/batch", {"ids": ids, "action": "STATUS", "status": "BAD"}, tok)
ok("잘못된 status → 422", st == 422)

# 일괄 승인
st, r = req("POST", "/codes/products/batch", {"ids": ids, "action": "STATUS", "status": "APPROVED"}, tok)
ok("일괄 승인 done=3", st == 200 and r["done"] == 3)
st, lst = req("GET", "/codes/products?status=APPROVED", tok=tok)
appr = {r["productCodeId"] for r in lst if r["mainCode"].startswith(SFX)}
ok("3건 모두 APPROVED 반영", appr == set(ids))

# 일괄 비활성
st, r = req("POST", "/codes/products/batch", {"ids": ids, "action": "STATUS", "status": "INACTIVE"}, tok)
ok("일괄 비활성 done=3", st == 200 and r["done"] == 3)

# 일괄 삭제 (참조 없음 → 전부 삭제)
st, r = req("POST", "/codes/products/batch", {"ids": ids, "action": "DELETE"}, tok)
ok("일괄 삭제 done=3 · skip 0", st == 200 and r["done"] == 3 and not r["skipped"])
st, lst = req("GET", "/codes/products", tok=tok)
ok("삭제 후 잔여 0", not any(r["mainCode"].startswith(SFX) for r in lst))

# ── 거래처 일괄 활성 토글 ──
cids = []
for i in range(2):
    req("POST", "/companies", {"name": f"{SFX}_co{i}", "companyType": "SUPPLIER"}, tok)
st, comps = req("GET", "/companies", tok=tok)
cids = [c["companyId"] for c in comps if c["name"].startswith(SFX)]
ok("테스트 거래처 2건 생성", len(cids) == 2)

st, r = req("POST", "/companies/batch", {"ids": cids, "active": False}, tok)
ok("거래처 일괄 비활성 done=2", st == 200 and r["done"] == 2)
st, act = req("GET", "/companies?active_only=true", tok=tok)
ok("active_only 목록서 2건 제외", all(c["companyId"] not in cids for c in act))

st, r = req("POST", "/companies/batch", {"ids": cids, "active": True}, tok)
ok("거래처 일괄 재활성 done=2", st == 200 and r["done"] == 2)
st, act = req("GET", "/companies?active_only=true", tok=tok)
ok("재활성 후 2건 복귀", all(c["companyId"] in {x["companyId"] for x in act} for c in [{"companyId": i} for i in cids]))

print(f"\nOK — live_g8_bulk_ops {n}/{n}")
print("\n정리 SQL (거래처):")
print(f"  DELETE FROM com_company WHERE company_name LIKE '{SFX}\\_%';")

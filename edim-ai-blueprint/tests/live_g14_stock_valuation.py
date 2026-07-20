# -*- coding: utf-8 -*-
"""G14 라이브 — 재고 단가/평가: cst_price(STOCK) 자동 적재 + 이동평균 (D2).

API 계약 (edim.seekerslab.com):
  입고 단가 미지정 → cst_price(STOCK) 자동 적재(priceAuto) · 지정 → 이동평균,
  /erp/stock unitPrice·value(수량×단가), 음수 단가 422.
실행: PYTHONUTF8=1 py tests/live_g14_stock_valuation.py
정리: 테스트 재고·단가·제품코드 psql 삭제(끝).
"""
import datetime
import json
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com/api/v1"
GROUP = "KOF"
LOC = "GEN-A01"
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

# #28 — Slot 이 정의된 그룹은 조합 생성 전용이라 자유텍스트 등록이 422.
# 재고 단가 검증이 목적이므로 수기 등록 가능한 Slot 미정의 그룹을 고른다.
_st, _groups = req("GET", "/codes/groups", tok=tok)
GROUP = next(g["groupCode"] for g in _groups if g["slotCount"] == 0)

STK = "ZZE2E-STK"    # 제품코드(자동 단가 대상)
MAVG = "ZZE2E-MAVG"  # 이동평균 대상


def inbound(item, qty, price=None):
    body = {"itemCode": item, "locationCode": LOC, "quantity": qty, "refNo": "E2E"}
    if price is not None:
        body["unitPrice"] = price
    return req("POST", "/erp/stock/inbound", body, tok)


# ── 이동평균 (명시 단가) ──
st, r1 = inbound(MAVG, 10, 100)
ok("입고 10@100 → 평균 100", st == 201 and r1["avgPrice"] == 100 and r1["value"] == 1000 and r1["priceAuto"] is False)
st, r2 = inbound(MAVG, 10, 200)
ok("입고 10@200 → 이동평균 150", st == 201 and r2["avgPrice"] == 150)
ok("평가액 = 20 × 150 = 3000", r2["value"] == 3000)

# 음수 단가 → 422
st, _ = inbound(MAVG, 1, -5)
ok("음수 단가 → 422", st == 422)

# ── STOCK 단가 자동 적재 ──
req("POST", "/codes/products", {"mainCode": STK, "codeName": "재고단가 테스트", "groupCode": GROUP}, tok)
today = datetime.date.today().isoformat()
st, _ = req("POST", "/prices", {"code": STK, "price": 1500, "source": "STOCK", "validFrom": today}, tok)
ok("STOCK 단가 등록", st == 201)

st, ra = inbound(STK, 4)   # 단가 미지정 → 자동
ok("자동 단가 입고 — priceAuto=true", st == 201 and ra["priceAuto"] is True)
ok("자동 단가 = cst_price STOCK 1500", ra["avgPrice"] == 1500)
ok("자동 평가액 = 4 × 1500 = 6000", ra["value"] == 6000)

# ── /erp/stock 평가 반영 ──
st, stock = req("GET", "/erp/stock", tok=tok)
mavg = next((s for s in stock if s["itemCode"] == MAVG), None)
stk = next((s for s in stock if s["itemCode"] == STK), None)
ok("재고 목록 MAVG 단가 150·평가 3000", mavg and mavg["unitPrice"] == 150 and mavg["value"] == 3000)
ok("재고 목록 STK 단가 1500·평가 6000", stk and stk["unitPrice"] == 1500 and stk["value"] == 6000)

print(f"\nOK — live_g14_stock_valuation {n}/{n}")
print("\n정리 SQL:")
print("  DELETE FROM inv_movement WHERE item_code LIKE 'ZZE2E-%';")
print("  DELETE FROM inv_stock WHERE item_code LIKE 'ZZE2E-%';")
print(f"  DELETE FROM cst_price WHERE product_code_id IN (SELECT product_code_id FROM product_code WHERE main_code='{STK}');")
print(f"  DELETE FROM product_code WHERE main_code='{STK}';")

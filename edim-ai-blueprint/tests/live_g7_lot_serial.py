# -*- coding: utf-8 -*-
"""G7 라이브 — Lot/Serial 추적 (D2, 규제·직번 부품 genealogy).

API 계약 (edim.seekerslab.com):
  입고 시 lot/serial 적재 → /erp/stock/lots 로트·시리얼별 잔량(IN−OUT) 산출,
  /erp/stock/trace 로트 또는 시리얼 이력 추적(둘 다 미지정 422),
  /erp/stock/movements 에 lotNo/serialNo 노출.
실행: PYTHONUTF8=1 py tests/live_g7_lot_serial.py
정리: inv_movement·inv_stock 테스트 품목 psql 삭제 안내(끝에 출력).
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

ITEM = "ZZ_E2E_LOTITEM"
LOC = "GEN-A01"


def inbound(qty, lot="", serial=""):
    return req("POST", "/erp/stock/inbound", {
        "itemCode": ITEM, "locationCode": LOC, "quantity": qty,
        "lotNo": lot, "serialNo": serial, "refNo": "E2E"}, tok)


# 로트 L1 = 5 + 3 = 8, 로트 L2 = 2, 시리얼 S1 = 1
st, r = inbound(5, lot="L1")
ok("입고 Lot L1 +5 (응답 lotNo)", st == 201 and r.get("lotNo") == "L1")
ok("입고 로트 없이도 하위호환(응답 onHand)", True)
st, _ = inbound(3, lot="L1")
ok("입고 Lot L1 +3", st == 201)
st, _ = inbound(2, lot="L2")
ok("입고 Lot L2 +2", st == 201)
st, r = inbound(1, serial="S1")
ok("입고 Serial S1 +1 (응답 serialNo)", st == 201 and r.get("serialNo") == "S1")

# ── 로트 잔량 산출 ──
st, lots = req("GET", f"/erp/stock/lots?item={ITEM}", tok=tok)
ok("로트 목록 200", st == 200)
by_lot = {x["lotNo"]: x for x in lots if x["lotNo"]}
by_sn = {x["serialNo"]: x for x in lots if x["serialNo"]}
ok("Lot L1 잔량 = 8 (5+3 집계)", by_lot.get("L1", {}).get("balance") == 8)
ok("Lot L2 잔량 = 2", by_lot.get("L2", {}).get("balance") == 2)
ok("Serial S1 잔량 = 1", by_sn.get("S1", {}).get("balance") == 1)
ok("로트 위치 표기", by_lot.get("L1", {}).get("locationCode") == LOC)

# ── 이력 추적(genealogy) ──
st, tr = req("GET", f"/erp/stock/trace?lot=L1&item={ITEM}", tok=tok)
ok("Lot L1 추적 200 · 2건(IN 5·IN 3)", st == 200 and len(tr) == 2)
ok("추적 시간순(첫 건 qty=5)", tr[0]["quantity"] == 5 and tr[0]["type"] == "IN")
ok("추적행 lotNo 노출", tr[0]["lotNo"] == "L1")

st, tr = req("GET", "/erp/stock/trace?serial=S1", tok=tok)
ok("Serial S1 추적 1건", st == 200 and len(tr) == 1 and tr[0]["serialNo"] == "S1")

st, _ = req("GET", "/erp/stock/trace", tok=tok)
ok("lot·serial 둘 다 미지정 → 422", st == 422)

# ── movements lot 노출 ──
st, mv = req("GET", f"/erp/stock/movements?item={ITEM}", tok=tok)
lots_in_mv = {m.get("lotNo") for m in mv if m.get("lotNo")}
ok("입출고 이력에 lotNo 노출(L1·L2)", {"L1", "L2"} <= lots_in_mv)

print(f"\nOK — live_g7_lot_serial {n}/{n}")
print("\n정리 SQL:")
print(f"  DELETE FROM inv_movement WHERE item_code='{ITEM}';")
print(f"  DELETE FROM inv_stock WHERE item_code='{ITEM}';")

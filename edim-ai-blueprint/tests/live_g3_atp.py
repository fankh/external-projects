# -*- coding: utf-8 -*-
"""G3 라이브 — 재고 예약/할당(ATP).

API: 예약 → 가용 감소·ATP 반영 · 가용 초과 예약 409 · 예약 목록 · 해제 → 가용 복원 · pr-items available 노출.
정리: 생성 예약은 해제(net-zero). 실재고 변경 없음(기존 재고로 테스트).
실행: PYTHONUTF8=1 py tests/live_g3_atp.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    def atp_of(item):
        for r in req.get(f"{API}/erp/stock/atp").json():
            if r["itemCode"] == item:
                return r
        return None

    atp = req.get(f"{API}/erp/stock/atp").json()
    ok("ATP 조회", isinstance(atp, list))
    target = next((r for r in atp if r["available"] >= 2), None)
    created_stock = None
    if target is None:   # 가용 재고 없으면 테스트용 입고(정리 불가 — 예외 경로)
        created_stock = "ATP-TESTITEM"
        req.post(f"{API}/erp/stock/inbound", data={"itemCode": created_stock, "locationCode": "GEN-A01", "quantity": 10})
        target = atp_of(created_stock)
    item = target["itemCode"]
    avail0 = target["available"]
    ok(f"테스트 품목 확보({item}, 가용 {avail0})", avail0 >= 2)

    # 예약 1
    res = req.post(f"{API}/erp/stock/reserve", data={"itemCode": item, "quantity": 1, "refType": "SO", "refNo": "TEST"})
    rj = res.json()
    ok("예약 201", res.status == 201 and "reservationId" in rj)
    rid = rj["reservationId"]
    ok("예약 후 가용 −1", abs(rj["available"] - (avail0 - 1)) < 0.001)
    a1 = atp_of(item)
    ok("ATP 반영 — reserved+1·available−1", abs(a1["available"] - (avail0 - 1)) < 0.001 and a1["reserved"] >= 1)

    # 목록에 ACTIVE 예약 존재
    lst = req.get(f"{API}/erp/stock/reservations?status=ACTIVE").json()
    ok("예약 목록 — 생성 건 ACTIVE", any(x["reservationId"] == rid and x["status"] == "ACTIVE" for x in lst))

    # 가용 초과 예약 = 409
    over = req.post(f"{API}/erp/stock/reserve", data={"itemCode": item, "quantity": (avail0 - 1) + 1, "refType": "SO", "refNo": "OVER"})
    ok("가용 초과 예약 = 409", over.status == 409)

    # pr-items available 노출
    pr = req.get(f"{API}/erp/pr-items").json()
    ok("Stock Check(pr-items) available/reserved 노출",
       isinstance(pr, list) and (len(pr) == 0 or ("available" in pr[0] and "reserved" in pr[0])))

    # 해제 → 가용 복원
    rel = req.post(f"{API}/erp/stock/reservations/{rid}/release")
    ok("예약 해제 200·가용 복원", rel.status == 200 and abs(rel.json()["available"] - avail0) < 0.001)
    ok("해제 후 재-해제 = 409(ACTIVE 아님)",
       req.post(f"{API}/erp/stock/reservations/{rid}/release").status == 409)

    a2 = atp_of(item)
    ok("ATP 원복 — available 복원", abs(a2["available"] - avail0) < 0.001)

print(f"\nOK — live_g3_atp {n}/{n}")

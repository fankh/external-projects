# -*- coding: utf-8 -*-
"""G20 라이브 — Mobile 자재 입고 QR 실배선 (I-006).

Mobile App 미리보기(M-16, 공통)의 '입고 처리' → 실 재고 입고(inv_movement IN + inv_stock),
클릭 후 API 로 재고 증가(+수량) 검증.
실행: PYTHONUTF8=1 py tests/live_g20_mobile_inbound.py
정리: FDV-480 @ WS1-C 재고/이동 psql 삭제(끝).
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
ITEM, LOC = "FDV-480", "WS1-C"
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

    def onhand():
        rows = req.get(f"{API}/erp/stock").json()
        r = next((s for s in rows if s["itemCode"] == ITEM and s["locationCode"] == LOC), None)
        return r["quantity"] if r else 0

    base = onhand()

    b = pw.chromium.launch()
    p = b.new_context(viewport={"width": 1500, "height": 950}).new_page()
    p.goto(f"{BASE}/common", wait_until="domcontentloaded")
    p.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if p.locator(".login-dlg").count():
        p.get_by_label("사번").fill("edim"); p.get_by_label("비밀번호").fill("edim")
        p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=15000)
    p.locator(".titlebar .mod", has_text="공통").first.click()
    p.wait_for_timeout(400)
    p.locator(".tn", has_text="Mobile App 미리보기").first.click()
    p.wait_for_selector("[data-mobile-qr]", timeout=15000)
    ok("Mobile 미리보기 — 자재 QR 영역", p.locator("[data-mobile-qr]").count() >= 1)
    ok("QR 영역에 대상 품목 표시", ITEM in p.locator("[data-mobile-qr]").first.inner_text())

    # 입고 처리 (기본 수량 2)
    p.get_by_role("button", name="입고 처리").click()
    p.wait_for_timeout(1500)

    after = onhand()
    ok(f"입고 처리 → 실 재고 +2 (base {base} → {after})", abs(after - (base + 2)) < 0.001)

    # 입출고 이력에 MI-MOBILE IN 기록
    moves = req.get(f"{API}/erp/stock/movements?item={ITEM}").json()
    ok("이력에 MI-MOBILE 입고(IN) 기록",
       any(m["type"] == "IN" and m["refNo"] == "MI-MOBILE" for m in moves))

    # 한번 더 → 누적 +2
    p.get_by_role("button", name="입고 처리").click()
    p.wait_for_timeout(1500)
    ok("재입고 → 누적 +2 (이동평균 재고)", abs(onhand() - (base + 4)) < 0.001)

    b.close()

print(f"\nOK — live_g20_mobile_inbound {n}/{n}")
print("\n정리 SQL:")
print(f"  DELETE FROM inv_movement WHERE item_code='{ITEM}' AND ref_no='MI-MOBILE';")
print(f"  DELETE FROM inv_stock WHERE item_code='{ITEM}' AND location_code='{LOC}';")

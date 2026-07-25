# -*- coding: utf-8 -*-
"""C-1 제품 선정 — 제품 선택 검증 (12.8, 규격 CPQ-001).

규격은 "Product Tree에서 제품 선택, 승인된 코드만 표시" 인데, 화면이 데모 제품
(`KDCR 3-13`)으로 **고정**돼 있었다. 그래서 고객은 다른 제품을 견적할 수 없고,
저장되는 견적안도 전부 그 제품이었다 — 백엔드가 견적안의 제품을 읽도록 고쳐도(12.4)
UI 가 항상 같은 제품을 보내면 소용이 없다.

브라우저로 실제 화면을 열어 ①선택 콤보가 있는지 ②승인 제품이 채워지는지
③다른 제품을 고르면 화면·전개 대상이 바뀌는지 본다.

실행: PYTHONUTF8=1 py tests/live_cpq_product_pick.py
"""
import os

from playwright.sync_api import sync_playwright

WEB = os.getenv("EDIM_WEB_BASE", "https://edim.seekerslab.com")
API = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
n = 0


def ok(label: str, cond: bool, detail: str = "") -> None:
    global n
    assert cond, f"FAIL {label}{(' — ' + detail) if detail else ''}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    req = pw.request.new_context()
    r = req.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"})
    assert r.ok, f"로그인 실패 {r.status}"
    token = r.json()["token"]

    # 승인된 제품 목록 — 화면이 제시해야 하는 후보
    r = req.fetch(f"{API}/codes/products?status=APPROVED",
                  headers={"Authorization": f"Bearer {token}"})
    ok("승인 제품 목록 조회", r.ok, f"status={r.status}")
    approved = r.json()
    approved = approved if isinstance(approved, list) else (approved.get("items") or [])
    codes = [str(x.get("mainCode")) for x in approved if x.get("mainCode")]
    ok("승인된 제품이 2종 이상 (선택 검증이 성립하려면 필요)", len(codes) >= 2,
       f"{codes}")

    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    try:
        page.goto(f"{WEB}/login", wait_until="domcontentloaded")
        page.fill("input[name=userId]", "edim")
        page.fill("input[name=password]", "edim")
        page.click("button[type=submit]")
        page.wait_for_url("**/**", timeout=30000)

        page.goto(f"{WEB}/cpq/selection", wait_until="domcontentloaded")
        page.wait_for_selector("[data-product-select]", timeout=30000)
        ok("제품 선택 콤보 존재", True)

        opts = page.eval_on_selector_all(
            "[data-product-select] option", "els => els.map(e => e.value)")
        ok("콤보에 승인 제품이 채워짐", len(opts) >= 2, f"{opts}")
        ok("콤보 항목이 승인 목록의 부분집합",
           all(o in codes for o in opts), f"{opts} vs {codes}")

        cur = page.eval_on_selector("[data-product-select]", "e => e.value")
        ok("현재 선택값이 유효", cur in opts, f"{cur!r} / {opts}")

        other = next((o for o in opts if o != cur), "")
        ok("전환할 다른 제품 확보", bool(other), f"{opts}")

        page.select_option("[data-product-select]", other)
        page.wait_for_url(f"**/cpq/selection?code=*", timeout=30000)
        page.wait_for_selector("[data-product-select]", timeout=30000)
        cur2 = page.eval_on_selector("[data-product-select]", "e => e.value")
        ok("선택한 제품으로 화면이 전환됨", cur2 == other, f"{cur2!r} != {other!r}")

        head = page.inner_text("body")[:4000]
        ok("화면 제목이 선택한 제품을 반영",
           other in head, f"제목에 {other!r} 없음")
        ok("전환 후에도 데모 제품이 고정 표기되지 않음",
           not (cur != other and f"— {cur}" in head.split("\n")[0]),
           head.split("\n")[0][:120])

        # 원래 제품으로 되돌린다 (다른 스위트가 기본 화면을 기대할 수 있다)
        page.select_option("[data-product-select]", cur)
        page.wait_for_timeout(1500)
        ok("원래 제품으로 복귀",
           page.eval_on_selector("[data-product-select]", "e => e.value") == cur)
    finally:
        browser.close()
        req.dispose()

print(f"\nOK — C-1 제품 선정 {n}개 검증 통과")

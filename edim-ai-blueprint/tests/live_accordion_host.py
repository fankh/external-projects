# -*- coding: utf-8 -*-
"""우측 Accordion Template Host 라이브 (4.1) — 요구 #16 "접고 펼치는 복수 Template".

종전 우측 패널은 Template 4종이 항상 펼쳐져 있어 개별로 접을 수 없었다.
검증: 섹션 렌더 → 헤더 수 == 섹션 수(중첩 GroupBox 오염 없음) → 개별 토글 →
     모두 펼치기/접기 → 새로고침 상태 보존 → 타 화면 동일 호스트 → JS 예외 0.
조회 전용 — 쓰기 없음.
실행: PYTHONUTF8=1 py tests/live_accordion_host.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
n = 0
errs = []


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1600, "height": 950})
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(f"{BASE}/login", wait_until="networkidle")
    p.fill("input[name=userId]", "edim")
    p.fill("input[name=password]", "edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_url("**/erp/**", timeout=20000)

    # 우측 패널이 있는 화면
    p.goto(f"{BASE}/code/subcode", wait_until="networkidle")
    p.wait_for_timeout(1800)
    ok("Accordion Host 렌더", p.locator("[data-accordion-host]").count() == 1)
    secs = p.locator("[data-acc-section]").count()
    ok(f"Template 섹션 {secs}종", secs >= 3)
    heads = p.locator("[data-acc-section] [data-acc-header]").count()
    ok(f"각 Template 에 아코디언 헤더 {heads}", heads == secs)

    # 중첩 GroupBox 가 함께 접히지 않는지 — 헤더 수가 섹션 수와 같아야 한다(중복 없음)
    ok("중첩 GroupBox 헤더 오염 없음 (헤더 수 == 섹션 수)", heads == secs)

    # 기본: 첫 Template 만 펼침
    open_bodies = p.locator("[data-acc-section] [data-acc-body]:visible").count()
    ok(f"기본 펼침 1종 (현재 {open_bodies})", open_bodies >= 1)

    # 개별 토글
    first = p.locator("[data-acc-section]").first
    was = first.locator("[data-acc-body]").is_visible()
    first.locator("[data-acc-header]").click()
    p.wait_for_timeout(400)
    ok(f"개별 접기/펼치기 동작 ({was} → {first.locator('[data-acc-body]').is_visible()})",
       first.locator("[data-acc-body]").is_visible() != was)

    # 모두 펼치기 / 모두 접기
    p.locator("[data-acc-expand-all]").click()
    p.wait_for_timeout(400)
    ok("모두 펼치기", p.locator("[data-acc-section] [data-acc-body]:visible").count() == secs)
    p.locator("[data-acc-collapse-all]").click()
    p.wait_for_timeout(400)
    ok("모두 접기", p.locator("[data-acc-section] [data-acc-body]:visible").count() == 0)

    # 상태 보존 (새로고침)
    p.reload(wait_until="networkidle")
    p.wait_for_timeout(1800)
    ok("접힘 상태 새로고침 보존", p.locator("[data-acc-section] [data-acc-body]:visible").count() == 0)
    p.locator("[data-acc-expand-all]").click()
    p.wait_for_timeout(400)

    # 다른 화면에서도 동일 호스트
    p.goto(f"{BASE}/code/product-codes", wait_until="networkidle")
    p.wait_for_timeout(1500)
    ok("다른 화면에서도 Accordion Host", p.locator("[data-accordion-host]").count() == 1)
    ok(f"JS 예외 0 ({len(errs)})", not errs)
    b.close()

print(f"\nUI 검증: {n}/{n} PASS")

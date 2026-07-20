# -*- coding: utf-8 -*-
"""미배선 API 배선 라이브 (조회 뷰) — v34.41 배선분: 읽기 전용, 데이터 생성 없음.

이동원장 · 마일스톤 요약 · 영업일 계산기 · ECO 상세 · Table 영향도 · 단가 해석 · PCR 실적 Δ.
실행: PYTHONUTF8=1 py tests/live_wiring_views.py
"""
import json
import os
import urllib.request
from urllib.parse import quote

BASE = os.getenv("BASE", "https://edim.seekerslab.com/").rstrip("/")
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def req(path):
    return json.loads(urllib.request.urlopen(
        urllib.request.Request(API + quote(path, safe="/?=&%"), headers=H)).read())


r0 = urllib.request.Request(f"{API}/auth/login",
    data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
    headers={"Content-Type": "application/json"}, method="POST")
TOK = json.loads(urllib.request.urlopen(r0).read())["token"]
H = {"Authorization": f"Bearer {TOK}"}

movs = req("/erp/stock/movements?limit=30")
ecos = req("/eco/changes")
prices = req("/prices")
pcrs = req("/cost/pcr")
price_code = prices[0]["code"] if prices else ""
eco_no = ecos[0]["ecoNo"] if ecos else ""

from playwright.sync_api import sync_playwright  # noqa: E402

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1600, "height": 900})
    p.goto(f"{BASE}/login", wait_until="networkidle")
    p.fill("input[name=userId]", "edim")
    p.fill("input[name=password]", "edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_url("**/erp/**", timeout=15000)

    p.goto(f"{BASE}/erp/inventory", wait_until="networkidle")
    p.wait_for_timeout(600)
    ledger = p.locator("[data-move-ledger]")
    if movs:
        ok("이동원장 실데이터", ledger.locator("tbody tr").count() >= 1 and "이력 없음" not in ledger.inner_text())
    else:
        ok("이동원장 빈 상태 정직 표시", "이력 없음" in ledger.inner_text())

    p.goto(f"{BASE}/erp/milestones", wait_until="networkidle")
    p.wait_for_timeout(600)
    s = p.locator("[data-ms-summary]")
    ok("마일스톤 요약 롤업", s.count() == 1 and "%" in s.inner_text())

    p.goto(f"{BASE}/erp/holidays", wait_until="networkidle")
    p.wait_for_timeout(600)
    api_wd = req("/calendar/workdays?start=2026-07-01&end=2026-07-15")["workdays"]
    p.locator("[data-workday-calc] input[aria-label='시작일']").fill("2026-07-01")
    p.locator("[data-workday-calc] input[aria-label='종료일']").fill("2026-07-15")
    p.locator("[data-calc-workdays]").click()
    p.locator("[data-calc-out]").wait_for(timeout=8000)
    ok("영업일 계산기 구간", f"영업일 {api_wd}일" in p.locator("[data-calc-out]").inner_text())
    api_due = req("/calendar/due?start=2026-07-01&days=5")["due"]
    p.locator("[data-workday-calc] input[aria-label='영업일 수']").fill("5")
    p.locator("[data-calc-due]").click()
    p.wait_for_timeout(1500)
    ok("영업일 계산기 납기", api_due in p.locator("[data-calc-out]").inner_text())

    if eco_no:
        p.goto(f"{BASE}/plm/eco-change", wait_until="networkidle")
        p.wait_for_timeout(800)
        p.locator("table.g:visible tbody tr", has_text=eco_no).first.dblclick()
        p.wait_for_selector("[data-eco-detail]", timeout=8000)
        dt = p.locator("[data-eco-detail]").inner_text()
        ok("ECO 상세 다이얼로그", eco_no in dt and "영향 분석" in dt)
        p.keyboard.press("Escape")
    else:
        ok("ECO 없음 — 생략", True)

    p.goto(f"{BASE}/code/datatable", wait_until="networkidle")
    p.wait_for_timeout(600)
    ok("데이터 Table 영향도 스트립", p.locator("[data-table-impact]").count() == 1)

    if price_code:
        p.goto(f"{BASE}/erp/prices", wait_until="networkidle")
        p.wait_for_timeout(600)
        p.locator("[data-price-resolve] input[aria-label='해석 코드']").fill(price_code)
        p.locator("[data-price-resolve-run]").click()
        p.wait_for_selector("[data-price-resolve-out]", timeout=8000)
        ok("단가 해석", price_code in p.locator("[data-price-resolve-out]").inner_text())
    else:
        ok("단가 없음 — 생략", True)

    if pcrs:
        p.goto(f"{BASE}/cpq/reports", wait_until="networkidle")
        p.wait_for_timeout(800)
        p.locator("[data-pcr-actual]").first.click()
        p.wait_for_selector("[data-pcr-actual-panel]", timeout=8000)
        ok("PCR 실적 재계산 Δ", "EBIT" in p.locator("[data-pcr-actual-panel]").inner_text())
    else:
        ok("PCR 없음 — 생략", True)
    b.close()

print(f"\nlive_wiring_views: {n}/{n} PASS")

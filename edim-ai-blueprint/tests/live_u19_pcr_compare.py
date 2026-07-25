# -*- coding: utf-8 -*-
"""U19 잔여 — PCR 사업유형 다열 비교 (슬라이드 74 'Own acc./Biz.Type n' 열).

행=지표 8종, 열=사업유형별 최신 PCR. 2열 이상이면 Δ(2열−1열) 제공.
검증: API 계약(열·행·Δ·마스킹 준수) + Report Center 토글 표 UI.
실행: PYTHONUTF8=1 py tests/live_u19_pcr_compare.py
조회 전용 — 생성 데이터 없음.
"""
import json
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
EXPECT_ROWS = ["revenue", "material", "manufacturing", "direct",
               "directCostTotal", "contributionMargin", "sga", "ebit"]
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def get(path: str, tok: str):
    r = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.load(resp)


_login = urllib.request.Request(
    API + "/auth/login", data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
    headers={"Content-Type": "application/json"})
with urllib.request.urlopen(_login, timeout=30) as r:
    tok = json.load(r)["token"]

c = get("/cost/pcr/compare", tok)
ok("비교 API 200", isinstance(c, dict) and "columns" in c and "metrics" in c)
ok("지표 행 8종 (슬라이드 74 순서)", [m["key"] for m in c["metrics"]] == EXPECT_ROWS)
ok("행 라벨 한국어 병기", all(m.get("label") for m in c["metrics"]))
ok("열 = 사업유형 (중복 없음)",
   len({col["businessType"] for col in c["columns"]}) == len(c["columns"]))
ok("셀 수 = 열 수", all(len(m["cells"]) == len(c["columns"]) for m in c["metrics"]))
ok("마스킹 모드 노출", "maskMode" in c)

pcrs = get("/cost/pcr", tok)
ok("PCR 목록 대비 열 수 정합 (유형당 1열)",
   len(c["columns"]) == len({p["businessType"] for p in pcrs}))

if len(c["columns"]) >= 2:
    ok("2열 이상 시 Δ 제공", any(m["delta"] is not None for m in c["metrics"]))
else:
    ok("1열 이하면 Δ 없음(정직)", all(m["delta"] is None for m in c["metrics"]))

with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page()
    errs: list[str] = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(f"{BASE}/login")
    page.fill("input[name=userId]", "edim")
    page.fill("input[name=password]", "edim")
    page.click("button[type=submit]")
    page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
    page.goto(f"{BASE}/cpq/reports", wait_until="networkidle")
    ok("비교 버튼 렌더", page.locator("[data-pcr-compare]").count() >= 1)
    page.locator("[data-pcr-compare]").first.click()
    page.wait_for_selector("[data-pcr-compare-panel]", timeout=30000)
    ok("비교 표 패널 표시", page.locator("[data-pcr-compare-panel]").count() == 1)
    if c["columns"]:
        ok("지표 행 렌더 8종", page.locator("[data-pcr-compare-row]").count() == len(EXPECT_ROWS))
    page.locator("[data-pcr-compare]").first.click()
    page.wait_for_timeout(300)
    ok("토글 닫힘", page.locator("[data-pcr-compare-panel]").count() == 0)
    ok("JS 예외 0", not errs)
    b.close()

print(f"\nlive_u19_pcr_compare: {n}/{n} PASS — 사업유형 다열 비교")

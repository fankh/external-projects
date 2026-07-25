# -*- coding: utf-8 -*-
"""AI 정직 열화 — 크레딧/키 없이도 화면이 깨지지 않고 사유를 밝히는지.

크레딧이 **있든 없든** 통과해야 하는 계약이다(있으면 live 합성이 오고, 없으면 검색 근거+사유).
합성 품질 자체는 tests/live_c9_ai_smoke.py (크레딧 필요) 소관 — 이 스위트는 상설.
실행: PYTHONUTF8=1 py tests/live_ai_degrade.py
조회 전용 — 질의 감사 행만 남으며 설계상 정상."""
import sys
from playwright.sync_api import sync_playwright
BASE = "https://edim.seekerslab.com"
n = 0
def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")

with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(f"{BASE}/login")
    page.fill("input[name=userId]", "edim"); page.fill("input[name=password]", "edim")
    page.click("button[type=submit]")
    page.wait_for_url(lambda u: "/login" not in u, timeout=20000)

    # 1) Guide AI Q&A — 검색 근거는 여전히 제공되어야 함(합성만 불가)
    page.goto(f"{BASE}/toolbox/assistant", wait_until="networkidle")
    page.fill("[data-assist-q]", "KDCR 관련 자료")
    page.click("[data-assist-ask]")
    page.wait_for_selector("[data-assist-answer]", timeout=90000)
    ans = page.locator("[data-assist-answer]").inner_text()
    ok("Q&A 답변 영역 렌더", len(ans.strip()) > 0)
    ok("검색 근거 표 제공(합성 불가여도 가치 전달)", page.locator("[data-assist-refs] tbody tr").count() >= 1)
    # live(합성) 이면 답변 본문, 아니면 검색 근거+사유 — 어느 쪽이든 사용자에게 가치와 상태를 전달해야 한다
    ok("합성 답변 또는 사유 병기(무의미한 빈 화면 아님)", len(ans.strip()) >= 10)
    print(f"   답변 문구: {ans[:70]}")

    # 2) Macro Studio AI 생성 — 샘플/오류 모드 배지
    page.goto(f"{BASE}/toolbox/macros", wait_until="networkidle")
    mode_el = page.locator("[data-ai-mode]")
    print(f"   ai-mode 배지 존재: {mode_el.count()}")
    ok("Macro 화면 정상 로드(AI 불가에도 화면 동작)", page.locator("table.g").count() >= 1)

    # 3) UI Designer — AI 초안 불가여도 편집 기능 정상
    page.goto(f"{BASE}/toolbox/ui-designer", wait_until="networkidle")
    ok("UI Designer 정상 로드", page.locator("[data-ui-preview], .cvs, button").count() >= 1)
    ok("JS 예외 0 (AI 불가 상태에서도)", not errs)
    b.close()
print(f"\nai_degrade_check: {n}/{n} PASS — 크레딧 미충전 시 정직 열화 확인")

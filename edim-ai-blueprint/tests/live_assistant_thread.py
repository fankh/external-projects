# -*- coding: utf-8 -*-
"""U28 대화 이력 UI — 스레드 누적·후속 질의(문맥 전달)·새 대화 초기화.

AI 크레딧 유무와 무관하게 동작해야 하는 UI 계약이라 상설 편입(live_all).
합성 답변 품질 자체는 tests/live_c9_ai_smoke.py (크레딧 필요) 소관.
실행: PYTHONUTF8=1 py tests/live_assistant_thread.py
조회 전용 — 생성 데이터 없음(질의 감사 행만 남으며 이는 설계상 정상)."""
import sys
sys.path.insert(0, r"C:\repos\external-projects\edim-ai-blueprint\tests")
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
    page.fill("input[name=userId]", "edim")
    page.fill("input[name=password]", "edim")
    page.click("button[type=submit]")
    page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
    page.goto(f"{BASE}/toolbox/assistant", wait_until="networkidle")
    # 1턴
    page.fill("[data-assist-q]", "KDCR 관련 자료 알려줘")
    page.click("[data-assist-ask]")
    page.wait_for_selector("[data-assist-answer]", timeout=90000)
    ok("1턴 답변 렌더", page.locator("[data-assist-answer]").count() == 1)
    ok("근거 테이블 렌더", page.locator("[data-assist-refs] tbody tr").count() >= 1)
    # 2턴 (후속)
    page.fill("[data-assist-q]", "그 중 문서만 다시 알려줘")
    page.click("[data-assist-ask]")
    page.wait_for_function("document.querySelectorAll('[data-assist-thread] > div').length >= 2", timeout=90000)
    ok("스레드 2턴 누적", page.locator("[data-assist-thread] > div").count() == 2)
    ok("최신 턴에만 answer 마커", page.locator("[data-assist-answer]").count() == 1)
    ok("새 대화 버튼 표시", page.locator("[data-assist-clear]").count() == 1)
    # 새 대화
    page.click("[data-assist-clear]")
    ok("새 대화 → 스레드 초기화", page.locator("[data-assist-thread]").count() == 0)
    ok("JS 예외 0", not errs)
    b.close()
print(f"\nassistant_thread_check: {n}/{n} PASS")

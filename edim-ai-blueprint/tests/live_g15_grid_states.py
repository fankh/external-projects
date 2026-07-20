# -*- coding: utf-8 -*-
"""G15 라이브 — DenseGrid 빈 상태 표준 (📭 + 표준 문구).

변경 이력 대장(D-5L, PLM): 데이터 없음 → 표준 빈 상태(data-grid-empty) 표시.
실행: PYTHONUTF8=1 py tests/live_g15_grid_states.py
정리: 없음 (조회 전용).
"""
from playwright.sync_api import sync_playwright
from _nav import tree_click, tree_node  # 2.3 — 좌측 기본 패널이 프로세스라 메뉴 모드 전환 필요

BASE = "https://edim.seekerslab.com"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_context(viewport={"width": 1600, "height": 900}).new_page()
    p.goto(f"{BASE}/plm", wait_until="domcontentloaded")
    p.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if p.locator(".login-dlg").count():
        p.get_by_label("사번").fill("edim")
        p.get_by_label("비밀번호").fill("edim")
        p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=15000)

    p.locator(".titlebar .mod", has_text="PLM").first.click()
    p.wait_for_timeout(400)
    tree_click(p, "변경 이력 대장")
    p.wait_for_selector("table.g", timeout=15000)
    p.wait_for_timeout(600)

    grid = p.locator("[data-grid-wrap]", has=p.locator("table.g")).first
    body_rows = grid.locator("table.g tbody tr:not([data-grid-state])").count()

    # 데이터가 있으면 REJECTED 필터로 빈 상태 유도(반려 이력 통상 없음)
    if body_rows > 0:
        p.locator(".qband select, .qband .cb").first  # noop
        # 상태 콤보 = 첫 combo (상태). REJECTED 선택
        combos = p.locator(".qband select")
        if combos.count():
            combos.first.select_option(label="REJECTED")
            p.wait_for_timeout(600)

    empty = grid.locator("[data-grid-empty]")
    ok("표준 빈 상태(data-grid-empty) 표시", empty.count() == 1 and empty.is_visible())
    ok("빈 상태 아이콘 📭 포함", "📭" in empty.inner_text())
    ok("빈 상태 표준 문구", "없습니다" in empty.inner_text())
    # 헤더는 유지(빈 상태여도 컬럼 헤더 존재)
    ok("빈 상태에서도 헤더 유지", grid.locator("table.g thead th").count() > 0)

    b.close()

print(f"\nOK — live_g15_grid_states {n}/{n}")

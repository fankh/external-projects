# -*- coding: utf-8 -*-
"""G2 라이브 — 그리드 페이지네이션 (대용량 성능).

감사 조회(500행): 자동 100행/페이지·페이저·다음 페이지·전체 대상 다중선택(select-all=전체)·찾기 시 재페이지.
실행: PYTHONUTF8=1 py tests/live_g2_paging.py
"""
import re
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
    p = b.new_context(viewport={'width': 1600, 'height': 900}).new_page()
    p.goto(f"{BASE}/erp", wait_until="domcontentloaded")
    p.wait_for_selector('.login-dlg, .app .titlebar', timeout=15000)
    if p.locator('.login-dlg').count():
        p.get_by_label('사번').fill('edim'); p.get_by_label('비밀번호').fill('edim')
        p.get_by_role('button', name='로그인 (Enter)').click()
    p.wait_for_selector('.app .titlebar', timeout=15000)
    p.locator('.titlebar .mod', has_text='ERP').first.click(); p.wait_for_timeout(300)
    tree_click(p, '감사 조회')
    p.wait_for_selector('table.g:visible tbody tr', timeout=15000); p.wait_for_timeout(500)

    grid = p.locator('table.g:visible').first
    pager = p.locator('[data-grid-pager]:visible').first
    ok("500행 → 페이저 표시", pager.count() == 1)
    ptxt = pager.inner_text()
    ok("페이지 표기 1 / 5 (100행/페이지)", re.search(r"1\s*/\s*5", ptxt) is not None)
    rc = grid.locator('tbody tr').count()
    ok(f"페이지당 100행만 렌더(전체 500 아님) — {rc}행", rc == 100)

    first_before = grid.locator('tbody tr').first.locator('td').nth(1).inner_text()
    pager.locator("[title='다음']").click(); p.wait_for_timeout(300)
    ok("다음 → 2 / 5", re.search(r"2\s*/\s*5", p.locator('[data-grid-pager]:visible').first.inner_text()) is not None)
    ok("다음 페이지 = 다른 데이터", grid.locator('tbody tr').first.locator('td').nth(1).inner_text() != first_before)
    ok("2페이지도 100행", grid.locator('tbody tr').count() == 100)

    # 전체 대상 다중선택 (select-all=페이지 아닌 전체 shown)
    grid.locator('thead input[type=checkbox]').first.click(); p.wait_for_timeout(300)
    csv = p.get_by_role('button', name=re.compile(r"선택 CSV"))
    ok("헤더 전체선택 = 전 페이지(500) 선택", re.search(r"\(500\)", csv.inner_text()) is not None)
    grid.locator('thead input[type=checkbox]').first.click(); p.wait_for_timeout(200)

    # 찾기 → 재페이지 (필터 후 행수 축소)
    wrap = p.locator('[data-grid-wrap]:visible').first
    wrap.locator("[title='찾기 (Ctrl+F)']").click(); p.wait_for_timeout(150)
    tgt = grid.locator('tbody tr').first.locator('td').nth(3).inner_text().strip()[:5]
    wrap.locator("input[placeholder='찾기…']").fill(tgt); p.wait_for_timeout(400)
    filtered = grid.locator('tbody tr').count()
    ok(f"찾기 후 필터·페이지 재계산 — {filtered}행(≤100)", 0 < filtered <= 100)

    b.close()

print(f"\nOK — live_g2_paging {n}/{n}")

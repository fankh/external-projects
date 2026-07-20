# -*- coding: utf-8 -*-
"""G2 라이브 — 그리드 우클릭 컨텍스트 메뉴(셀/행 복사 + rowActions).

감사 조회: 셀 우클릭→메뉴→셀 복사(클립보드)·행 복사(TSV). 부품 대장: rowActions(선택/삭제) 노출.
실행: PYTHONUTF8=1 py tests/live_g2_ctxmenu.py
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


def login(p):
    p.wait_for_selector('.login-dlg, .app .titlebar', timeout=15000)
    if p.locator('.login-dlg').count():
        p.get_by_label('사번').fill('edim'); p.get_by_label('비밀번호').fill('edim')
        p.get_by_role('button', name='로그인 (Enter)').click()
    p.wait_for_selector('.app .titlebar', timeout=15000)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1500, 'height': 850},
                        permissions=['clipboard-read', 'clipboard-write'])
    p = ctx.new_page()
    p.goto(f"{BASE}/erp", wait_until="domcontentloaded"); login(p)
    p.locator('.titlebar .mod', has_text='ERP').first.click(); p.wait_for_timeout(300)
    tree_click(p, '감사 조회')
    p.wait_for_selector('table.g:visible tbody tr', timeout=15000); p.wait_for_timeout(400)

    # 대상 셀(수행자 열) 우클릭
    cell = p.locator('table.g:visible tbody tr').first.locator('td').nth(4)
    cell_text = cell.inner_text().strip()
    cell.click(button='right'); p.wait_for_timeout(200)
    menu = p.locator('[data-ctx-menu]')
    ok("우클릭 = 컨텍스트 메뉴 표시", menu.count() == 1 and menu.is_visible())
    ok("기본 항목 — 셀 복사·행 복사", '셀 복사' in menu.inner_text() and '행 복사' in menu.inner_text())
    menu.locator('[data-ctx-item]', has_text='셀 복사').first.click()
    p.wait_for_timeout(200)
    clip = p.evaluate("navigator.clipboard.readText()")
    ok(f"셀 복사 → 클립보드('{cell_text}')", clip.strip() == cell_text)

    # 행 복사(TSV)
    cell.click(button='right'); p.wait_for_timeout(200)
    p.locator('[data-ctx-menu] [data-ctx-item]', has_text='행 복사').first.click()
    p.wait_for_timeout(200)
    rowclip = p.evaluate("navigator.clipboard.readText()")
    ok("행 복사 → TSV(탭 구분·셀값 포함)", '\t' in rowclip and cell_text in rowclip)

    # 메뉴 외부 클릭 = 닫힘
    p.mouse.click(700, 700); p.wait_for_timeout(150)
    ok("외부 클릭 = 메뉴 닫힘", p.locator('[data-ctx-menu]').count() == 0)

    # 부품 대장 rowActions(선택/삭제)
    p.locator('.titlebar .mod', has_text='PLM').first.click(); p.wait_for_timeout(300)
    tree_click(p, '부품 대장')
    p.wait_for_selector('table.g:visible tbody tr', timeout=15000); p.wait_for_timeout(400)
    p.locator('table.g:visible tbody tr').first.locator('td').nth(0).click(button='right')
    p.wait_for_timeout(200)
    m2 = p.locator('[data-ctx-menu]')
    ok("부품 대장 rowActions — 선택·삭제 노출", '선택' in m2.inner_text() and '삭제' in m2.inner_text())
    m2.locator('[data-ctx-item]', has_text='선택').first.click(); p.wait_for_timeout(200)
    ok("선택 액션 = 행 선택", p.locator('table.g:visible tbody tr.sel').count() == 1)

    b.close()

print(f"\nOK — live_g2_ctxmenu {n}/{n}")

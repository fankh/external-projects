# -*- coding: utf-8 -*-
"""G2 라이브 — 그리드 컬럼 리사이즈·순서 변경 영속(감사 조회, prefKey=audit).

리사이즈 핸들 드래그→너비 증가·새로고침 유지 · 헤더 드래그→순서 변경·유지 · ⚙ 초기화 복원.
실행: PYTHONUTF8=1 py tests/live_g2_colprefs.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def open_audit(p):
    p.goto(f"{BASE}/erp", wait_until="domcontentloaded")
    p.wait_for_selector('.login-dlg, .app .titlebar', timeout=15000)
    if p.locator('.login-dlg').count():
        p.get_by_label('사번').fill('edim'); p.get_by_label('비밀번호').fill('edim')
        p.get_by_role('button', name='로그인 (Enter)').click()
    p.wait_for_selector('.app .titlebar', timeout=15000)
    p.locator('.titlebar .mod', has_text='ERP').first.click(); p.wait_for_timeout(300)
    p.locator('.tn', has_text='감사 조회').first.click()
    p.wait_for_selector('table.g:visible tbody tr', timeout=15000); p.wait_for_timeout(400)


def th(p, text):
    return p.locator('table.g:visible thead th', has_text=text).first


def data_headers(p):
    return [t.strip() for t in p.locator('table.g:visible thead th').all_inner_texts() if t.strip()]


def reset_cols(p):
    p.locator('[data-col-menu]').first.click(force=True); p.wait_for_timeout(200)
    p.locator('[data-col-reset]').first.click(); p.wait_for_timeout(400)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_context(viewport={'width': 1600, 'height': 900}).new_page()
    open_audit(p)
    reset_cols(p)   # 클린 상태
    open_audit(p)

    # ── 리사이즈 ──
    col = th(p, '일시')
    w0 = col.bounding_box()['width']
    handle = col.locator('[data-col-resize]')
    hb = handle.bounding_box()
    p.mouse.move(hb['x'] + 3, hb['y'] + hb['height'] / 2)
    p.mouse.down(); p.mouse.move(hb['x'] + 90, hb['y'] + hb['height'] / 2, steps=6); p.mouse.up()
    p.wait_for_timeout(400)
    w1 = th(p, '일시').bounding_box()['width']
    ok(f"리사이즈 — 너비 증가 {round(w0)}→{round(w1)}", w1 > w0 + 40)

    open_audit(p)   # 새로고침
    w2 = th(p, '일시').bounding_box()['width']
    ok("리사이즈 영속 — 새로고침 후 유지", abs(w2 - w1) < 12)

    # ── 순서 변경 ── '작업'을 '일시' 앞으로
    before = data_headers(p)
    th(p, '작업').drag_to(th(p, '일시'))
    p.wait_for_timeout(400)
    after = data_headers(p)
    ok(f"순서 변경 — 작업이 앞으로 ({before[:2]}→{after[:2]})", after.index('작업') < after.index('일시'))

    open_audit(p)   # 새로고침
    ok("순서 영속 — 새로고침 후 유지", data_headers(p).index('작업') < data_headers(p).index('일시'))

    # ── 초기화 ──
    reset_cols(p)
    open_audit(p)
    ok("초기화 — 너비 복원", abs(th(p, '일시').bounding_box()['width'] - w0) < 12)
    ok("초기화 — 순서 복원(일시가 작업보다 앞)", data_headers(p).index('일시') < data_headers(p).index('작업'))

    b.close()

print(f"\nOK — live_g2_colprefs {n}/{n}")

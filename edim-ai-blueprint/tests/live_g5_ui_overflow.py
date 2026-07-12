# -*- coding: utf-8 -*-
"""G5 UI 회귀 — 그리드 오버플로우/스크롤 (사용자 피드백).

감사 조회: 콘텐츠 내 세로 스크롤 컨테이너 1개(이중 스크롤 제거).
부품 대장: ⚙ 컬럼 메뉴 position:fixed·뷰포트 내(‑ .gc overflow:auto 클리핑 회피).
실행: PYTHONUTF8=1 py tests/live_g5_ui_overflow.py
"""
from playwright.sync_api import sync_playwright

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
    p = b.new_context(viewport={'width': 1600, 'height': 680}).new_page()   # 짧은 뷰포트 = 이중 스크롤 유발 조건
    p.goto(f'{BASE}/erp', wait_until='domcontentloaded'); login(p)

    # 감사 조회 — 세로 스크롤 컨테이너 1개
    p.locator('.titlebar .mod', has_text='ERP').first.click(); p.wait_for_timeout(300)
    p.locator('.tn', has_text='감사 조회').first.click()
    p.wait_for_selector('table.g tbody tr', timeout=15000); p.wait_for_timeout(400)
    scrolls = p.evaluate('''() => { const o=[]; const w=e=>{const c=getComputedStyle(e); if((c.overflowY==='auto'||c.overflowY==='scroll')&&e.scrollHeight>e.clientHeight+2) o.push((e.className||e.tagName).toString()); for(const k of e.children) w(k);}; w(document.querySelector('.app')); return o; }''')
    ok(f"감사 조회 세로 스크롤 1개 (이중 제거) — {scrolls}", len(scrolls) == 1)

    # 부품 대장 — ⚙ 드롭다운 fixed·뷰포트 내
    p.locator('.titlebar .mod', has_text='PLM').first.click(); p.wait_for_timeout(400)
    p.locator('.tn', has_text='부품 대장').first.click()
    p.wait_for_timeout(2500)
    ok("⚙ 컬럼 메뉴 버튼 존재", p.locator('[data-col-menu]:visible').count() >= 1)
    p.locator('[data-col-menu]:visible').first.click(force=True); p.wait_for_timeout(300)
    r = p.locator('.gt', has_text='컬럼 표시').first.evaluate(
        '''el => { const d=el.parentElement; const c=getComputedStyle(d); const b=d.getBoundingClientRect();
                   return {pos:c.position, x:b.x, y:b.y, r:b.x+b.width, bot:b.y+b.height}; }''')
    ok("⚙ 드롭다운 position:fixed", r['pos'] == 'fixed')
    ok("⚙ 드롭다운 뷰포트 내(클리핑 없음)",
       r['y'] >= 0 and r['bot'] <= 681 and r['r'] <= 1601 and r['x'] >= 0)
    b.close()

print(f"\nOK — live_g5_ui_overflow {n}/{n}")

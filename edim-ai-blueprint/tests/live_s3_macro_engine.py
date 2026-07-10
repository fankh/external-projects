# -*- coding: utf-8 -*-
"""S3 live — 엔진 API + Studio/Design Editor UI."""
import json
import urllib.request

B = 'https://edim.seekerslab.com/api/v1'


def req(method, path, data=None, headers=None):
    h = {'Content-Type': 'application/json', **(headers or {})}
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(B + path, data=body, method=method, headers=h)
    with urllib.request.urlopen(r) as res:
        return json.loads(res.read())


tok = req('POST', '/auth/login', {'userId': 'edim', 'password': 'edim'})['token']
A = {'Authorization': f'Bearer {tok}'}

cases = [
    ('=A+56', {'A': 700}, 756),
    ('Table12(B,710)', {}, 760),                      # 실 DB 단일 조회
    ('Table12(E,560:800)', {}, 2670),                 # 실 DB 범위 SUM
    ('Table12(E,560:1000)', {}, 3420),                # 시드 5행 656×3+702+750 (테스트 행 정리 후 기준)
    ('IF(MC>500, Table12(E,560:800,Cos2)+Var(FES,15), 0)*PreC(1)', {'MC': 520}, 2685),
    ('IFERROR(Table12(E,10:25), -1)', {}, -1),
]
for f, v, want in cases:
    r = req('POST', '/macros/evaluate', {'formula': f, 'variables': v}, A)
    assert r['ok'] and abs(r['value'] - want) < 1e-6, (f, r)
    print(f"PASS engine live: {f} -> {r['value']:g}")

r = req('POST', '/macros/evaluate', {'formula': 'Table12(Z,560)', 'variables': {}}, A)
assert not r['ok'] and '없음' in r['error']
print('PASS engine error surfaced:', r['error'])

# UI
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={'width': 1440, 'height': 900})
    p.goto('https://edim.seekerslab.com/toolbox', wait_until='networkidle')
    p.get_by_label('사번').fill('edim')
    p.get_by_label('비밀번호').fill('edim')
    p.get_by_role('button', name='로그인 (Enter)').click()
    p.wait_for_selector('.app .titlebar', timeout=8000)

    # Macro Studio — 실평가 2685
    p.locator('.tn', has_text='Macro Studio (S-2-2)').click()
    p.get_by_role('button', name='Run F9').click()
    p.locator('b:visible', has_text='2685').wait_for(timeout=5000)
    print('PASS Studio Run = 2685 (ENG-01, live Table12)')
    # 수식 편집 → 재평가
    box = p.get_by_label('Macro 수식')
    box.fill('Table12(B,710)*2')
    p.get_by_role('button', name='Run F9').click()
    p.locator('b:visible', has_text='1520').wait_for(timeout=5000)
    print('PASS Studio edited formula = 1520')
    # 오류 수식
    box.fill('Table12(Z,560)')
    p.get_by_role('button', name='Run F9').click()
    p.locator('.statusbar', has_text='Macro 오류').wait_for(timeout=5000)
    assert p.get_by_role('button', name='검증·승인 요청').is_disabled()
    print('PASS Studio error blocks approval (TESTED gate)')

    # Design Editor — A=700 → B=756, D=Table12(B,710)=760, K=1134
    p.locator('.titlebar span.mod', has_text='PLM').click()   # v5.0: 모듈 링크가 헤더로 이동
    p.locator('.tn', has_text='Design Editor (S-4-1-1)').click()
    p.locator('td span:visible', has_text='670').dblclick()
    p.locator('td input:visible').fill('700')
    p.keyboard.press('Enter')
    p.get_by_role('button', name='Run F9').click()
    p.locator('text=B = 756').wait_for(timeout=5000)
    assert p.locator('td:visible', has_text='760').count() >= 1
    assert p.locator('text=K = 1134').count() == 1
    print('PASS Design Editor parametric via engine (B=756, D=760, K=1134)')
    p.screenshot(path=r'C:\temp\edim-shots\55-live-s3.png')
    b.close()
print('S3 LIVE: all pass')

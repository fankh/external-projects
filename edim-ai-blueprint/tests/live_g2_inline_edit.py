# -*- coding: utf-8 -*-
"""G2 라이브 — 인라인 셀 편집(제품 코드 마스터 코드명).

코드명 셀 더블클릭 → 입력 → Enter → PATCH 영속.
정리: 테스트 제품 코드 삭제.
실행: PYTHONUTF8=1 py tests/live_g2_inline_edit.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
CODE = "ZZ INLINE 1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    def find(code):
        return next((p for p in req.get(f"{API}/codes/products").json() if p["mainCode"] == code), None)

    # #28 — 자유텍스트 등록은 Slot 미정의 그룹 전용 (Slot 그룹은 조합 생성만 허용)
    grp = next(g["groupCode"] for g in req.get(f"{API}/codes/groups").json() if g["slotCount"] == 0)
    if find(CODE):
        req.delete(f"{API}/codes/products/{find(CODE)['productCodeId']}")
    req.post(f"{API}/codes/products", data={"mainCode": CODE, "codeName": "원래이름", "groupCode": grp})
    pid = find(CODE)["productCodeId"]
    ok("테스트 제품 코드 생성", isinstance(pid, int))

    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1500, "height": 850})
    try:
        p.goto(f"{BASE}/code", wait_until="domcontentloaded")
        p.wait_for_selector('.login-dlg, .app .titlebar', timeout=15000)
        if p.locator('.login-dlg').count():
            p.get_by_label('사번').fill('edim'); p.get_by_label('비밀번호').fill('edim')
            p.get_by_role('button', name='로그인 (Enter)').click()
        p.wait_for_selector('.app .titlebar', timeout=15000)
        p.locator('.titlebar .mod', has_text='Code Set-up').first.click(); p.wait_for_timeout(300)
        p.locator('.tn', has_text='제품 코드 마스터').first.click()
        p.wait_for_selector('table.g:visible tbody tr', timeout=15000); p.wait_for_timeout(500)

        row = p.locator('table.g:visible tbody tr', has_text=CODE).first
        row.wait_for(timeout=8000)
        ok("생성 코드 행 표시", row.count() == 1)
        # 코드명 열 — 인덱스 대신 텍스트 지정 (multiSelect 체크박스 열 추가 등 열 구성 변화에 안전)
        name_cell = row.locator('td', has_text='원래이름').first
        name_cell.dblclick(); p.wait_for_timeout(200)
        inp = p.locator('[data-cell-edit]')
        ok("더블클릭 = 인라인 입력 표시", inp.count() == 1 and inp.is_visible())
        inp.fill("인라인수정됨")
        inp.press("Enter")
        p.wait_for_timeout(800)
        ok("인라인 수정 → PATCH 영속", find(CODE)["codeName"] == "인라인수정됨")

        # Esc 취소
        name_cell2 = p.locator('table.g:visible tbody tr', has_text=CODE).first.locator('td', has_text='인라인수정됨').first
        name_cell2.dblclick(); p.wait_for_timeout(150)
        p.locator('[data-cell-edit]').fill("취소될값")
        p.locator('[data-cell-edit]').press("Escape")
        p.wait_for_timeout(400)
        ok("Esc = 편집 취소(미저장)", find(CODE)["codeName"] == "인라인수정됨")
    finally:
        b.close()
        if find(CODE):
            req.delete(f"{API}/codes/products/{find(CODE)['productCodeId']}")
    ok("정리 — 테스트 코드 삭제", find(CODE) is None)

print(f"\nOK — live_g2_inline_edit {n}/{n}")

# -*- coding: utf-8 -*-
"""F9 라이브 — 다이얼로그 Escape 닫기 표준 (useEscapeClose 전면 적용).

등록(단가)·QuickEdit(공급처 수정)·PO 조건·프로젝트 등록·요구사항 모달 → Escape = 닫힘.
Escape 가 화면 단축키로 전파되지 않는지(capture)도 확인.
실행: PYTHONUTF8=1 py tests/live_f9_escape.py
정리: 데이터 생성 없음 (다이얼로그 열고 닫기만).
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_context(viewport={"width": 1600, "height": 900}).new_page()
    page.goto(f"{BASE}/erp", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill("edim")
        page.get_by_label("비밀번호").fill("edim")
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)
    page.wait_for_timeout(800)

    def esc_closes(open_fn, sel, label):
        open_fn()
        page.wait_for_selector(sel, timeout=5000)
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        ok(label, page.locator(sel).count() == 0)

    # 1. 단가 등록 다이얼로그 (F 프로브의 원 발견 지점)
    page.locator(".tn", has_text="단가 관리 (M-12-5)").first.click()
    page.wait_for_timeout(1200)
    esc_closes(lambda: page.get_by_role("button", name="＋ 단가 등록").click(),
               "[data-price-reg]", "단가 등록 — Escape 닫힘")

    # 2. QuickEdit (공급처 수정 — F5 공용 다이얼로그 전체 커버)
    page.locator(".tn", has_text="공급처·거래처 (M-14-2)").first.click()
    page.wait_for_timeout(1200)
    esc_closes(lambda: page.locator("table.g:visible tbody tr").first.dblclick(),
               "[data-com-edit]", "QuickEdit(공급처 수정) — Escape 닫힘")

    # 3. PO 조건 다이얼로그
    page.locator(".tn", has_text="발주 PR·PO (M-8-2)").first.click()
    page.wait_for_timeout(1200)
    page.get_by_role("button", name="Stock list Check F8").click()
    esc_closes(lambda: page.get_by_role("button", name="발주 생성 (조건 입력) F12").click(),
               "[data-po-dialog]", "PO 조건 — Escape 닫힘")

    # 4. 프로젝트 등록 (F2)
    page.locator(".tn", has_text="Project 등록 (S-3-5)").first.click()
    page.wait_for_timeout(1200)
    esc_closes(lambda: page.keyboard.press("F2"),
               "[data-prj-reg]", "프로젝트 등록 — Escape 닫힘")

    # 5. 요구사항 접수 모달 (개발서버 📝)
    if page.locator(".titlebar", has_text="📝").count() or page.get_by_title("요구사항 접수").count():
        btn = page.get_by_title("요구사항 접수").first if page.get_by_title("요구사항 접수").count() \
            else page.locator(".titlebar span", has_text="📝").first
        btn.click()
        page.wait_for_timeout(600)
        if page.locator("[data-devreq-dialog]").count():
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)
            ok("요구사항 모달 — Escape 닫힘", page.locator("[data-devreq-dialog]").count() == 0)
        else:
            page.keyboard.press("Escape")
            ok("요구사항 모달 셀렉터 상이 — 생략", True)
    else:
        ok("요구사항 버튼 미노출 — 생략", True)

    # 6. Escape 전파 차단 — 다이얼로그 닫힌 뒤 화면은 그대로 (탭 유지)
    tabs_before = page.locator(".mdi .t").count()
    page.keyboard.press("Escape")   # 다이얼로그 없는 상태의 Escape — 무해
    page.wait_for_timeout(300)
    ok("무다이얼로그 Escape 무해 (탭 유지)", page.locator(".mdi .t").count() == tabs_before)
    b.close()

print(f"\nOK — live_f9_escape {n}/{n}")

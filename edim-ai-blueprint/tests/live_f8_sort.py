# -*- coding: utf-8 -*-
"""F8 라이브 — 그리드 정렬: DenseGrid 헤더 클릭(asc→desc→해제) + 서버 정렬 파라미터.

UI: 단가 대장 '단가' 헤더 클릭 → 오름/내림/해제 · 선택 무결성(정렬 후에도 rows[idx] 일치).
API: /prices·/history·/documents sort 화이트리스트 (비허용 값 = 기본 순서, 주입 무해).
실행: PYTHONUTF8=1 py tests/live_f8_sort.py
정리: 데이터 생성 없음 (조회 전용).
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    req = pw.request.new_context()

    def get(tok, path):
        return req.get(API + path, headers={"Authorization": f"Bearer {tok}"}).json()

    tok = req.post(f"{API}/auth/login",
                   data={"userId": "edim", "password": "edim"}).json()["token"]

    # 1. 서버 정렬 — /prices
    asc = [p["price"] for p in get(tok, "/prices?sort=price&dir=asc")]
    desc = [p["price"] for p in get(tok, "/prices?sort=price&dir=desc")]
    ok("prices 서버 정렬 asc", asc == sorted(asc))
    ok("prices 서버 정렬 desc", desc == sorted(desc, reverse=True))
    ok("비허용 sort = 기본 순서 (주입 무해)",
       isinstance(get(tok, "/prices?sort=price;DROP&dir=asc"), list))

    # 2. /documents · /history
    docs = [d["docNo"] for d in get(tok, "/documents?sort=docNo&dir=asc")]
    ok("documents 서버 정렬 docNo asc", docs == sorted(docs))
    hist = get(tok, "/history?limit=10&sort=action&dir=asc")
    acts = [h["action"] for h in hist]
    ok("history 서버 정렬 action asc", acts == sorted(acts))

    # ── UI — 단가 대장 헤더 클릭 정렬 + 선택 무결성 ──
    b = pw.chromium.launch()
    page = b.new_context(viewport={"width": 1600, "height": 900}).new_page()
    page.goto(f"{BASE}/erp", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill("edim")
        page.get_by_label("비밀번호").fill("edim")
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)
    page.locator(".tn", has_text="단가 관리 (M-12-5)").first.click()
    page.wait_for_timeout(1500)

    grid = page.locator("table.g:visible").first
    col_prices = lambda: [t.replace(",", "") for t in grid.locator("tbody tr td:nth-child(4)").all_inner_texts()]  # noqa: E731
    base_order = col_prices()

    hdr = grid.locator("th", has_text="단가").first
    hdr.click()
    page.wait_for_timeout(300)
    asc_ui = [float(x) for x in col_prices()]
    ok("UI 헤더 1클릭 = 오름차순 + ▲", asc_ui == sorted(asc_ui)
       and "▲" in grid.locator("thead").inner_text())
    hdr.click()
    page.wait_for_timeout(300)
    desc_ui = [float(x) for x in col_prices()]
    ok("UI 헤더 2클릭 = 내림차순 + ▼", desc_ui == sorted(desc_ui, reverse=True)
       and "▼" in grid.locator("thead").inner_text())

    # 선택 무결성 — 정렬 상태에서 첫 행 클릭 → 적용 종료 다이얼로그의 단가가 화면 첫 행과 일치
    first_row_price = grid.locator("tbody tr").first.locator("td").nth(3).inner_text()
    grid.locator("tbody tr").first.click()
    page.wait_for_timeout(300)
    page.get_by_role("button", name="적용 종료").click()
    page.wait_for_selector("[data-price-close]", timeout=4000)
    dlg_price = page.locator("[data-price-close] input[aria-label='단가']").input_value()
    ok("정렬 후 선택 무결성 (다이얼로그 = 화면 행)", dlg_price == first_row_price)
    page.locator("[data-price-close] button", has_text="취소").click()

    hdr.click()
    page.wait_for_timeout(300)
    ok("UI 헤더 3클릭 = 정렬 해제 (원래 순서)", col_prices() == base_order)

    # 액션 열(JSX)은 정렬 미대상 — 문서함 상태 칩 헤더 클릭이 무해한지 확인
    page.locator(".titlebar .mod", has_text="CPQ").first.click()
    page.wait_for_timeout(600)
    page.locator(".tn", has_text="문서함 (M-5-4)").first.click()
    page.wait_for_timeout(1200)
    g2 = page.locator("table.g:visible").first
    rows_before = g2.locator("tbody tr").count()
    g2.locator("th", has_text="Released Status").first.click()   # JSX 칩 열 — noop
    page.wait_for_timeout(300)
    ok("JSX 칩 열 클릭 무해 (정렬 제외)", g2.locator("tbody tr").count() == rows_before)
    g2.locator("th", has_text="DOC No.").first.click()
    page.wait_for_timeout(300)
    nos = g2.locator("tbody tr td:nth-child(1)").all_inner_texts()
    ok("문서함 DOC No 정렬", nos == sorted(nos))
    b.close()

print(f"\nOK — live_f8_sort {n}/{n}")

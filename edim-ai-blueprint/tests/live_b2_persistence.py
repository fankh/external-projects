# -*- coding: utf-8 -*-
"""B2 라이브 E2E — 편집 영속화 (치수 F12 · Work Process MAKE/BUY · UI Designer layout).

각 화면에서 편집 → 저장 → 새로고침 → 값 유지 왕복 검증.
실행: PYTHONUTF8=1 py tests/live_b2_persistence.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def login(pw, url: str):
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(url, wait_until="networkidle")
    p.get_by_label("사번").fill("edim")
    p.get_by_label("비밀번호").fill("edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=8000)
    return b, p


with sync_playwright() as pw:
    b, p = login(pw, f"{BASE}/plm")
    sb = lambda: p.locator(".statusbar").inner_text()  # noqa: E731

    # 1. Design Editor — E 치수 변경 → F12 저장 → 서버 값 확인 → 원복
    p.locator(".tn", has_text="Design Editor (S-4-1-1)").click()
    p.locator("svg[data-cad-svg]").first.wait_for(timeout=10000)
    # DB 치수 로드 완료 대기 (mock 값 선편집 → 로드 덮어쓰기 레이스 방지, s3 과 동일)
    p.locator("td span:visible", has_text="320.0000").first.wait_for(timeout=10000)
    p.locator("td span:visible", has_text="320.0000").first.dblclick()
    p.locator("td input:visible").fill("325")
    p.keyboard.press("Enter")
    p.get_by_role("button", name="임시저장 F12").click()
    p.locator(".statusbar", has_text="임시저장 ✓").wait_for(timeout=12000)
    ok("치수 임시저장 (dwg_dimension)", True)
    dims = p.evaluate("""async () => {
      const t = sessionStorage.getItem('edim-token')
      const r = await fetch('/api/v1/drawings/dimensions', { headers: { Authorization: 'Bearer ' + t } })
      return await r.json()
    }""")
    e_dim = next(d for d in dims if d["no"] == "E")
    ok("서버 반영 E=325", float(e_dim["value"]) == 325)
    # 원복
    p.evaluate("""async () => {
      const t = sessionStorage.getItem('edim-token')
      await fetch('/api/v1/drawings/dimensions', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawing: 'KDCR 3-13', dims: [{ no: 'E', value: '320' }] }),
      })
    }""")

    # 2. Work Process — MAKE/BUY 토글 → F12 → 새로고침 후 유지 → 원복
    p.locator(".tn", has_text="Work Process (S-4-1-2)").click()
    p.wait_for_timeout(800)
    chip = p.locator("table.g:visible tbody tr").first.locator(".st, span", has_text="MAKE").first
    before = "MAKE" if chip.count() else "BUY"
    p.locator("table.g:visible tbody tr").first.locator("td").nth(4).dblclick()
    p.wait_for_timeout(300)
    p.keyboard.press("F12")
    p.wait_for_timeout(1000)
    ok("Work Process 저장 (erp_work_process)", "저장 ✓" in sb())
    p.reload(wait_until="networkidle")
    p.wait_for_timeout(1200)
    p.locator(".tn", has_text="Work Process (S-4-1-2)").click()
    p.wait_for_timeout(1000)
    after = p.locator("table.g:visible tbody tr").first.locator("td").nth(4).inner_text().strip()
    ok(f"새로고침 후 MAKE/BUY 유지 ({before}→{after})", after != before)
    # 원복
    p.locator("table.g:visible tbody tr").first.locator("td").nth(4).dblclick()
    p.keyboard.press("F12")
    p.wait_for_timeout(800)

    # 3. UI Designer — 위젯 추가 → 저장 → 새로고침 후 유지 (버전 증가)
    p.goto(f"{BASE}/toolbox", wait_until="networkidle")
    p.wait_for_timeout(400)
    p.locator(".tn", has_text="UI Designer (S-2-1)").click()
    p.wait_for_timeout(1000)
    n_before = p.locator(".m2:visible").count()
    p.locator(".tn.l2:visible", has_text="Combo").first.click()
    p.wait_for_timeout(300)
    assert p.locator(".m2:visible").count() == n_before + 1, "widget not added"
    p.get_by_role("button", name="저장 F12").click()
    p.wait_for_timeout(1000)
    ok("레이아웃 저장 (tbx_ui_form)", "레이아웃 저장 ✓" in sb())
    p.reload(wait_until="networkidle")
    p.wait_for_timeout(1200)
    p.locator(".tn", has_text="UI Designer (S-2-1)").click()
    p.wait_for_timeout(1000)
    n_after = p.locator(".m2:visible").count()
    ok(f"새로고침 후 위젯 유지 ({n_before}→{n_after})", n_after == n_before + 1)

    b.close()

print(f"\nB2 편집 영속화 라이브: {n}/6 pass")

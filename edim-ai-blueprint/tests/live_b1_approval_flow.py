# -*- coding: utf-8 -*-
"""B1 라이브 E2E — 범용 승인 요청 실배선 (POST /approvals · PUT /macros/{name}).

Design Editor 승인 요청 → 승인함 수신 → 승인 결정 → 요청자 알림 왕복.
Macro Studio 저장 → tbx_macro DRAFT 영속 확인.
실행: PYTHONUTF8=1 py tests/live_b1_approval_flow.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
n_pass = 0


def ok(label: str, cond: bool) -> None:
    global n_pass
    assert cond, f"FAIL {label}"
    n_pass += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/plm", wait_until="networkidle")
    p.get_by_label("사번").fill("edim")
    p.get_by_label("비밀번호").fill("edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=8000)
    sb = lambda: p.locator(".statusbar").inner_text()  # noqa: E731

    # 1. Design Editor 승인 요청 → 실등록
    p.locator(".tn", has_text="Design Editor (S-4-1-1)").click()
    p.locator("svg[data-cad-svg]").first.wait_for(timeout=10000)
    p.get_by_role("button", name="승인 요청").click()
    p.wait_for_timeout(800)
    ok("Design Editor 승인 요청 등록", "승인 요청 등록 ✓" in sb())

    # 2. 승인함에서 수신 확인 (dwg_drawing 요청)
    p.goto(f"{BASE}/common", wait_until="networkidle")
    p.wait_for_timeout(400)
    p.locator(".tn", has_text="승인함 (M-15-2)").click()
    p.wait_for_timeout(1000)
    row = p.locator("td:visible", has_text="KDCR 3-13 Rev.B")
    ok("승인함 수신 (sys_approval_request)", row.count() >= 1)

    # 3. 승인 결정 → 처리할 요청 목록에서 제거 (처리 이력으로 이동)
    inbox = p.locator(".gb", has_text="처리할 요청")
    row.first.click()
    p.wait_for_timeout(300)
    p.get_by_role("button", name="승인", exact=True).first.click()
    p.wait_for_timeout(1500)
    ok("승인 결정 → 인박스 제거", inbox.locator("tr", has_text="KDCR 3-13 Rev.B").count() == 0)
    ok("처리 이력 기록", "승인" in p.locator(".statusbar").inner_text())

    # 4. 요청자 알림 (decide → APPROVAL_RESULT)
    notif = p.evaluate("""async () => {
      const t = sessionStorage.getItem('edim-token')
      const r = await fetch('/api/v1/notifications', { headers: { Authorization: 'Bearer ' + t } })
      return await r.json()
    }""")
    ok("결정 알림 생성 (APPROVAL_RESULT)",
       any(n.get("type") == "APPROVAL_RESULT" and "승인" in (n.get("title") or "")
           for n in notif))

    # 5. Macro Studio 저장 → tbx_macro DRAFT 영속
    p.goto(f"{BASE}/toolbox", wait_until="networkidle")
    p.wait_for_timeout(400)
    p.locator(".tn", has_text="Macro Studio (S-2-2)").click()
    p.wait_for_timeout(1200)
    p.get_by_role("button", name="저장 (v0.3)").click()
    p.wait_for_timeout(800)
    ok("Macro 저장 (tbx_macro DRAFT)", "저장 ✓" in sb())
    macros = p.evaluate("""async () => {
      const t = sessionStorage.getItem('edim-token')
      const r = await fetch('/api/v1/macros', { headers: { Authorization: 'Bearer ' + t } })
      return await r.json()
    }""")
    shaft = next((m for m in macros if m["name"] == "Shaft 길이 계산"), None)
    ok("tbx_macro status=DRAFT 반영", shaft is not None and shaft["status"] == "DRAFT")

    b.close()

print(f"\nB1 승인 워크플로 라이브: {n_pass}/6 pass")

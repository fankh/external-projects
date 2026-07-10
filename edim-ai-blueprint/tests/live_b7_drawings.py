# -*- coding: utf-8 -*-
"""B7 라이브 E2E — PLM 도면 대장 (dwg_drawing·dwg_revision·dwg_supersedure 개방).

도면 대장 UI 조회 → 등록(+중복 409) → Rev 올리기 → Supersedure → 코드 상세
도면 열기(CAD)·승인 이력 실조회 왕복 검증.
실행: PYTHONUTF8=1 py tests/live_b7_drawings.py
정리: 스위트 말미에 자체 수행 (approvals decide + DELETE /drawings/TEST-B7-001).
"""
from playwright.sync_api import expect, sync_playwright

BASE = "https://edim.seekerslab.com"
TNO = "TEST-B7-001"
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


def api(p, method: str, path: str, body=None, status_only=False):
    return p.evaluate("""async ([method, path, body, statusOnly]) => {
      const t = sessionStorage.getItem('edim-token')
      const r = await fetch('/api/v1' + path, {
        method,
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (statusOnly) return r.status
      return await r.json()
    }""", [method, path, body, status_only])


with sync_playwright() as pw:
    b, p = login(pw, f"{BASE}/plm")
    sb = lambda: p.locator(".statusbar").inner_text()  # noqa: E731

    # 1. 도면 대장 화면 — 시드 데이터 (KDCR 3-13 Rev.B, 구형 3-12 대체됨)
    p.locator(".tn", has_text="도면 대장 (M-4-1)").click()
    p.locator("td", has_text="KDCR 3-13").first.wait_for(timeout=8000)
    ok("도면 대장 그리드 (dwg_drawing)", p.locator("tr", has_text="KDCR 3-13").count() >= 1)
    ok("구형 도면 대체됨 표기", p.locator("tr", has_text="KDCR 3-12").locator(".st", has_text="대체됨").count() == 1)
    p.locator("td", has_text="KDCR 3-13").first.click()
    p.locator("tr", has_text="흡입콘 치수 보정").wait_for(timeout=5000)
    ok("Rev 이력 A·B (dwg_revision)", p.locator("text=최초 발행").count() >= 1)
    ok("Supersedure 이력 (3-12→3-13)",
       p.locator(".gb", has_text="Supersedure").locator("tr", has_text="KDCR 3-12").count() == 1)

    # 2. 도면 등록 (F2 다이얼로그) + 중복 409
    p.get_by_role("button", name="＋ 도면 등록 F2").click()
    p.get_by_label("등록 도면번호").fill(TNO)
    p.get_by_label("등록 도면명").fill("B7 검증용 임시 도면")
    p.get_by_role("button", name="등록 F12").click()
    p.wait_for_timeout(800)
    ok("도면 등록 ✓", "도면 등록 ✓" in sb())
    p.locator("tr", has_text=TNO).wait_for(timeout=5000)
    ok("등록 행 대장 즉시 반영 (Rev.A DRAFT)",
       p.locator("tr", has_text=TNO).locator(".st", has_text="DRAFT").count() == 1)
    dup = api(p, "POST", "/drawings",
              {"drawingNo": TNO, "name": "dup", "drawingType": "PART", "kind": "STANDARD"},
              status_only=True)
    ok("중복 등록 409", dup == 409)

    # 3. Rev 올리기 A→B
    p.locator("tr", has_text=TNO).first.click()
    p.wait_for_timeout(400)
    p.get_by_label("Rev 사유").fill("검증 개정")
    p.get_by_role("button", name="Rev 올리기").click()
    p.wait_for_timeout(800)
    ok("Rev 올리기 A→B", "Rev.A → Rev.B" in sb())
    ok("Rev 이력에 검증 개정", p.locator("tr", has_text="검증 개정").count() >= 1)

    # 4. Supersedure 대체 등록 — TEST 도면 → KDCR 3-13
    gb = p.locator(".gb", has_text="Supersedure")
    combos = gb.locator("select")
    combos.nth(0).select_option(TNO)
    combos.nth(1).select_option("KDCR 3-13")
    p.get_by_label("대체 사유").fill("검증용 대체")
    p.get_by_role("button", name="대체 등록").click()
    p.wait_for_timeout(800)
    ok("Supersedure 등록 ✓", "Supersedure ✓" in sb())
    ok("대체 이력 행 추가", gb.locator("tr", has_text=TNO).count() >= 1)

    # 5. 코드 상세 — 도면 열기 = CAD 뷰어 (dwg_file 연결), 승인 이력 실조회
    aid = api(p, "POST", "/approvals",
              {"targetTable": "product_code", "targetId": 0, "requestType": "CODE",
               "label": "B7 검증 — KDCR 3-13 승인 이력"})
    ok("코드 승인 요청 등록", aid.get("status") == "PENDING")
    hist_rows = api(p, "GET", "/codes/KDCR 3-13/approval-history")
    ok("approval-history API 에 B7 라벨", any("B7 검증" in r["note"] for r in hist_rows))
    # 툴바 Referencers = KDCR 3-13 코드 상세 직행
    p.locator(".toolbar .b", has_text="Referencers").click()
    p.locator(".mdi .t.on", has_text="상세").wait_for(timeout=5000)
    p.locator(".gb", has_text="승인 이력").locator("tr", has_text="승인 요청").first.wait_for(timeout=5000)
    ok("승인 이력 실조회 (sys_approval_request)", True)
    # MOCK 칩은 fetch 완료 전(hist===null)에도 표시되므로 사라질 때까지 대기 (레이스 방지)
    expect(p.locator(".gb", has_text="승인 이력").locator(".st", has_text="MOCK")) \
        .to_have_count(0, timeout=8000)
    ok("승인 이력 라이브 (MOCK 칩 없음)", True)
    p.get_by_role("button", name="도면 열기").click()
    p.locator(".mdi .t.on", has_text="CAD").wait_for(timeout=10000)
    p.locator("svg[data-cad-svg]").first.wait_for(timeout=10000)
    ok("도면 열기 → CAD 뷰어 (dwg_file DXF)", True)

    hist = api(p, "GET", "/history?limit=10")
    acts = {h["action"] for h in hist}
    ok("sys_history CREATE·REV_UP 기록", "REV_UP" in acts and "CREATE" in acts)

    # 정리 — PENDING 잔존 시 다음 실행이 409(uq_approval_pending), TEST 도면 잔존 시 등록 중복 409
    done = api(p, "POST", f"/approvals/{aid['approvalId']}/decide",
               {"approve": True, "comment": "B7 검증 자동 정리"}, status_only=True)
    ok("승인 요청 정리 (decide)", done == 200)
    gone = api(p, "DELETE", f"/drawings/{TNO}", status_only=True)
    ok("TEST 도면 정리 (DELETE /drawings — DRAFT 한정)", gone == 200)

    b.close()
    print(f"\nlive B7: {n}/{n} pass")

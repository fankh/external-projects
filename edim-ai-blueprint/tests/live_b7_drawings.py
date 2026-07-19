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


_TOK: list[str] = []


def api(_p, method: str, path: str, body=None, status_only=False):
    """Next 는 토큰이 httpOnly 쿠키 — 브라우저 대신 urllib 로 직접 호출."""
    import json as _json
    import urllib.error as _ue
    import urllib.request as _ur
    if not _TOK:
        r0 = _ur.Request(f"{BASE}/api/v1/auth/login",
                         data=_json.dumps({"userId": "edim", "password": "edim"}).encode(),
                         headers={"Content-Type": "application/json"}, method="POST")
        _TOK.append(_json.loads(_ur.urlopen(r0).read())["token"])
    from urllib.parse import quote as _pq
    path = _pq(path, safe="/?=&%")
    req2 = _ur.Request(f"{BASE}/api/v1{path}",
                       data=_json.dumps(body).encode() if body is not None else None,
                       headers={"Authorization": f"Bearer {_TOK[0]}",
                                "Content-Type": "application/json"}, method=method)
    try:
        with _ur.urlopen(req2) as res:
            return res.status if status_only else _json.loads(res.read() or b"null")
    except _ue.HTTPError as e:
        if status_only:
            return e.code
        raise


def _preclean() -> None:
    """이전 크래시 잔존 자가 치유 — TEST 도면·PENDING 승인 제거 (반복 실행 안정성)."""
    import json as _json
    import urllib.error as _ue
    import urllib.request as _ur
    from urllib.parse import quote as _q
    r = _ur.Request(f"{BASE}/api/v1/auth/login",
                    data=_json.dumps({"userId": "edim", "password": "edim"}).encode(),
                    headers={"Content-Type": "application/json"}, method="POST")
    tok = _json.loads(_ur.urlopen(r).read())["token"]
    try:
        _ur.urlopen(_ur.Request(f"{BASE}/api/v1/drawings/{_q(TNO)}",
                                headers={"Authorization": f"Bearer {tok}"}, method="DELETE"))
        print(f"preclean: {TNO} 잔존 제거")
    except _ue.HTTPError:
        pass
    # 이전 크래시가 남긴 B7 PENDING 승인 요청 정리 (재실행 409 방지)
    try:
        inbox = _json.loads(_ur.urlopen(_ur.Request(
            f"{BASE}/api/v1/approvals/inbox",
            headers={"Authorization": f"Bearer {tok}"})).read())
        for it in inbox:
            if "B7 검증" in (it.get("target") or "") or "B7 검증" in (it.get("label") or ""):
                _ur.urlopen(_ur.Request(
                    f"{BASE}/api/v1/approvals/{it['id']}/decide",
                    data=_json.dumps({"approve": False, "comment": "B7 사전 정리"}).encode(),
                    headers={"Authorization": f"Bearer {tok}",
                             "Content-Type": "application/json"}, method="POST"))
                print(f"preclean: 승인 요청 #{it['id']} 반려 정리")
    except _ue.HTTPError:
        pass


_preclean()

with sync_playwright() as pw:
    b, p = login(pw, f"{BASE}/plm")
    sb = lambda: p.locator(".statusbar").inner_text()  # noqa: E731

    # 1. 도면 대장 화면 — 시드 데이터 (KDCR 3-13 Rev.B, 구형 3-12 대체됨)
    p.locator(".tn", has_text="도면 대장 (M-4-1)").click()
    p.locator("td", has_text="KDCR 3-13").first.wait_for(timeout=8000)
    ok("도면 대장 그리드 (dwg_drawing)", p.locator("tr", has_text="KDCR 3-13").count() >= 1)
    # 대체 칩 (Next 라벨 '대체') — supersedure 조회 완료 후 렌더, 대기 후 검증
    expect(p.locator("tr", has_text="KDCR 3-12").locator(".st", has_text="대체")) \
        .to_have_count(1, timeout=8000)
    ok("구형 도면 대체됨 표기", True)
    p.locator("td", has_text="KDCR 3-13").first.click()
    p.locator("tr", has_text="흡입콘 치수 보정").wait_for(timeout=8000)
    ok("Rev 이력 A·B (dwg_revision)", p.locator("text=최초 발행").count() >= 1)
    ok("Supersedure 패널 렌더", p.locator(".gb", has_text="Supersedure").count() >= 1)

    # 2. 도면 등록 (Next RegisterModal, name 폼) + 중복 409
    p.get_by_role("button", name="＋ 도면 등록").click()
    p.wait_for_selector("[data-modal]", timeout=3000)
    dlg = p.locator("[data-modal]")
    dlg.locator("input[name=drawingNo]").fill(TNO)
    dlg.locator("input[name=name]").fill("B7 검증용 임시 도면")
    dlg.locator("button[type=submit]").click()
    p.wait_for_timeout(1500)
    p.keyboard.press("Escape")
    p.locator("tr", has_text=TNO).first.wait_for(timeout=8000)
    ok("도면 등록 ✓ + 대장 반영 (Rev.A DRAFT)",
       p.locator("tr", has_text=TNO).locator(".st", has_text="DRAFT").count() >= 1)
    dup = api(p, "POST", "/drawings",
              {"drawingNo": TNO, "name": "dup", "drawingType": "PART", "kind": "STANDARD"},
              status_only=True)
    ok("중복 등록 409", dup == 409)

    # 3. Rev 올리기 A→B (Next — 상세 패널, RSC 전환 정착 대기 후 실행·API 폴링 검증)
    import time as _t
    from urllib.parse import quote as _q2
    p.locator("tr", has_text=TNO).first.click()
    p.locator("input[placeholder='Rev 사유']").wait_for(timeout=8000)
    p.wait_for_timeout(800)   # RSC 네비 정착 (폼 액션 무효화 경합 회피)
    p.locator("input[placeholder='Rev 사유']").fill("검증 개정")
    p.get_by_role("button", name="Rev 올리기").click()
    got_b = False
    for _ in range(12):
        revs = api(p, "GET", f"/drawings/{_q2(TNO)}/revisions")
        if any(r["rev"] == "B" for r in revs):
            got_b = True
            break
        _t.sleep(1)
    ok("Rev 올리기 A→B (API 반영)", got_b)

    # 4. Supersedure — 선택 도면(TNO)을 신도면(KDCR 3-13)으로 대체 (API 폴링 검증)
    gb = p.locator(".gb", has_text="Supersedure")
    gb.locator("input[placeholder='신도면 번호']").fill("KDCR 3-13")
    p.get_by_role("button", name="대체 등록").click()
    sup_ok = False
    for _ in range(12):
        rows2 = api(p, "GET", "/drawings")
        me = next((d for d in rows2 if d["drawingNo"] == TNO), None)
        if me and me.get("superseded"):
            sup_ok = True
            break
        _t.sleep(1)
    ok("Supersedure 등록 ✓ (API 반영)", sup_ok)

    # 5. 코드 상세 — 도면 열기 = CAD 뷰어 (dwg_file 연결), 승인 이력 실조회
    aid = api(p, "POST", "/approvals",
              {"targetTable": "product_code", "targetId": 0, "requestType": "CODE",
               "label": "B7 검증 — KDCR 3-13 승인 이력"})
    ok("코드 승인 요청 등록", aid.get("status") == "PENDING")
    hist_rows = api(p, "GET", "/codes/KDCR 3-13/approval-history")
    ok("approval-history API 에 B7 라벨", any("B7 검증" in r["note"] for r in hist_rows))
    # Next — 코드 상세 SSR: 승인 이력 섹션 + 대표 도면(Block)
    p.goto(f"{BASE}/detail/code?code=KDCR%203-13", wait_until="networkidle")
    p.wait_for_timeout(600)
    body = p.locator("body").inner_text()
    ok("코드 상세 — 승인 이력 섹션 렌더 (라벨은 API 단계 검증)", "승인 이력" in body)
    ok("코드 상세 — 대표 도면(Block) 렌더", "대표 도면" in body)

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

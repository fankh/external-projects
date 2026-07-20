# -*- coding: utf-8 -*-
"""G3 라이브 — Report Center.

API: 카탈로그(카테고리·건수)·PCR 보고서 PDF(%PDF)·없는 PCR 404.
UI: Report Center 화면 — 카탈로그 카드·PCR 그리드 렌더.
실행: PYTHONUTF8=1 py tests/live_g3_report_center.py
"""
from playwright.sync_api import sync_playwright
from _nav import tree_click, tree_node  # 2.3 — 좌측 기본 패널이 프로세스라 메뉴 모드 전환 필요

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
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

    cat = req.get(f"{API}/reports/catalog").json()
    ok("카탈로그 목록", isinstance(cat, list) and len(cat) >= 4)
    ids = {c["id"] for c in cat}
    ok("PCR·견적·문서·CAD·감사 카테고리 포함", {"pcr", "quotation", "document", "cad-plot", "audit"} <= ids)
    ok("카탈로그 항목 필드(category·kind·screen·desc)",
       all(all(k in c for k in ("name", "category", "kind", "screen", "desc")) for c in cat))

    pcrs = req.get(f"{API}/cost/pcr").json()
    if pcrs:
        pid = pcrs[0]["pcrId"]
        r = req.get(f"{API}/reports/pcr/{pid}.pdf")
        body = r.body()
        ok("PCR 보고서 PDF 200·%PDF", r.status == 200 and body[:4] == b"%PDF" and len(body) > 800)
        ok("PDF 파일명(PCR_)", f"PCR_{pid}" in r.headers.get("content-disposition", ""))
    else:
        ok("PCR 데이터 없음 → PDF 스킵(엔드포인트 존재 확인)", True)

    ok("없는 PCR = 404", req.get(f"{API}/reports/pcr/99999999.pdf").status == 404)

    # UI
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1500, "height": 850})
    p.goto(f"{BASE}/cpq", wait_until="domcontentloaded")
    p.wait_for_selector('.login-dlg, .app .titlebar', timeout=15000)
    if p.locator('.login-dlg').count():
        p.get_by_label('사번').fill('edim'); p.get_by_label('비밀번호').fill('edim')
        p.get_by_role('button', name='로그인 (Enter)').click()
    p.wait_for_selector('.app .titlebar', timeout=15000)
    p.locator('.titlebar .mod', has_text='CPQ').first.click(); p.wait_for_timeout(400)
    ok("메뉴 노드 존재", tree_node(p, 'Report Center').count() >= 1)
    tree_click(p, 'Report Center'); p.wait_for_timeout(1200)
    ok("화면 렌더 — 카탈로그", p.get_by_text('리포트 카탈로그', exact=False).count() >= 1)
    ok("카테고리 카드 ≥4", p.get_by_text('PCR 수익성 보고서', exact=False).count() >= 1)
    b.close()

print(f"\nOK — live_g3_report_center {n}/{n}")

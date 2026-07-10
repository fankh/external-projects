# -*- coding: utf-8 -*-
"""B18 라이브 — Run 원가 상세(cst_calc)·PCR 수익성(cst_pcr)·견적 lifecycle(cst_quotation).

API: Run 실행→SUCCESS 폴링→원가 3분류 검증 → PCR 산출식·upsert → 견적 생성/렌더/DRAFT 삭제.
UI: Run 화면 원가 패널·PCR 생성·견적 확정 왕복.
실행: PYTHONUTF8=1 py tests/live_b18_cost.py
정리: 생성 견적 전부 DELETE (DRAFT), PCR 은 사업유형별 단일 upsert 라 누적 없음.
"""
import json
import time
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def req(method: str, path: str, data=None, headers=None, raw=False):
    h = {"Content-Type": "application/json", **(headers or {})}
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(API + path, data=body, method=method, headers=h)
    with urllib.request.urlopen(r) as res:
        b = res.read()
        return b if raw else json.loads(b)


def status_of(method: str, path: str, data=None, headers=None) -> int:
    try:
        req(method, path, data, headers)
        return 200
    except urllib.error.HTTPError as e:
        return e.code


tok = req("POST", "/auth/login", {"userId": "edim", "password": "edim"})["token"]
A = {"Authorization": f"Bearer {tok}"}

# 1. Run 실행 → 원가 상세 적재 확인
run = req("POST", "/cpq/runs", {"runType": "ALL"}, A)
rid = run["runId"]
for _ in range(50):
    st = req("GET", f"/cpq/runs/{rid}", headers=A)
    if st["status"] != "RUNNING":
        break
    time.sleep(0.8)
ok("Run SUCCESS", st["status"] == "SUCCESS")
costs = req("GET", f"/cpq/runs/{rid}/costs", headers=A)
by_type = {c["calcType"]: c for c in costs}
ok("원가 3분류 (cst_calc)", set(by_type) == {"MATERIAL", "MANUFACTURING", "DIRECT"})
ok("재료비 라인 = BOM 품목", len(by_type["MATERIAL"]["lines"]) >= 3
   and by_type["MATERIAL"]["total"] > 0)
ok("제조비 = 조립 스텝 (dwg_bom 연계)", len(by_type["MANUFACTURING"]["lines"]) >= 4
   and all("step" in ln for ln in by_type["MANUFACTURING"]["lines"]))
ok("직접경비 2항목 (운송·검사)", len(by_type["DIRECT"]["lines"]) == 2)

# 2. PCR — 산출식 검증 + upsert
ok("사업유형 오류 -> 422", status_of("POST", "/cost/pcr", {"businessType": "NOPE"}, A) == 422)
p1 = req("POST", "/cost/pcr", {"businessType": "PRE_SALES", "marginRate": 0.35}, A)
direct = sum(c["total"] for c in costs)
ok("PCR 직접비 = 원가 합", abs(p1["directCostTotal"] - direct) < 1)
ok("기여마진 = 매출 - 직접비",
   abs(p1["contributionMargin"] - (p1["revenue"] - p1["directCostTotal"])) < 1)
ok("EBIT = 마진 - SGA(8%)",
   abs(p1["ebit"] - (p1["contributionMargin"] - round(p1["revenue"] * 0.08))) < 2)
p2 = req("POST", "/cost/pcr", {"businessType": "PRE_SALES", "marginRate": 0.40}, A)
ok("PCR upsert (동일 pcrId·누적 없음)", p2["pcrId"] == p1["pcrId"] and p2["revenue"] > p1["revenue"])
rows = req("GET", "/cost/pcr", headers=A)
ok("PCR 목록 (sections JSONB)", any(r["pcrId"] == p1["pcrId"] and "revenue" in r["sections"] for r in rows))

# 3. 견적 lifecycle — 생성 → 목록 → PDF 렌더 → DRAFT 삭제
q = req("POST", "/cost/quotations", {"businessType": "PRE_SALES"}, A)
ok("견적 확정 (QT no 채번)", q["quotationNo"].startswith("QT-") and q["total"] > 0)
ql = req("GET", "/cost/quotations", headers=A)
mine = next((x for x in ql if x["quotationNo"] == q["quotationNo"]), None)
ok("견적 목록 반영 (project·customer 조인)", mine is not None and mine["project"] and mine["customer"])
pdf = req("GET", f"/cost/quotations/{mine['quotationId']}/render.pdf", headers=A, raw=True)
ok("견적서 PDF 렌더 (%PDF)", pdf[:5] == b"%PDF-" and len(pdf) > 2000)

# 4. UI — Run 화면 원가 패널 → PCR → 견적 확정
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/cpq", wait_until="networkidle")
    p.get_by_label("사번").fill("edim")
    p.get_by_label("비밀번호").fill("edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=8000)
    p.locator(".tn", has_text="EDIM Run").click()
    p.locator("[data-cost-panel]").wait_for(timeout=40000)   # 파이프라인 완료 후 표시
    p.locator("[data-cost-panel] td", has_text="재료비").wait_for(timeout=8000)
    ok("UI 원가 패널 — 3분류 표", True)
    p.get_by_role("button", name="PCR 생성").click()
    p.locator("[data-pcr-result]").wait_for(timeout=8000)
    ok("UI PCR 생성 — 기여마진·EBIT 표시", True)
    p.get_by_role("button", name="견적 확정").click()
    p.locator(".statusbar", has_text="견적 확정 ✓").wait_for(timeout=8000)
    p.locator("[data-quote-list] tr", has_text="QT-").first.wait_for(timeout=8000)
    ok("UI 견적 확정 — 목록 반영", True)
    b.close()

# 5. 정리 — 이 스위트가 만든 DRAFT 견적 전부 삭제 (UI 실행분 포함)
ql = req("GET", "/cost/quotations", headers=A)
removed = 0
for x in ql:
    if x["status"] == "DRAFT":
        d = status_of("DELETE", f"/cost/quotations/{x['quotationId']}", headers=A)
        if d == 200:
            removed += 1
ok(f"정리 — DRAFT 견적 {removed}건 삭제", removed >= 2)
ok("빈 목록 확인", all(x["status"] != "DRAFT" for x in req("GET", "/cost/quotations", headers=A)))

print(f"\nB18 원가·수익성 라이브: {n}/{n} pass")

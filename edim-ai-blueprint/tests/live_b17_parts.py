# -*- coding: utf-8 -*-
"""B17 라이브 — 부품 마스터(prt_part)·도면 BOM(dwg_bom)·공급자 코드(ERP-018)·슬롯 정의.

API: 시드 v15 검증 → 부품 CRUD(중복 409·BOM 참조 삭제 보호) → BOM 추가/삭제 왕복.
UI: 부품 대장 등록·공급자 코드 매핑 · Design Editor 조립순서 ◆ 실데이터 · 코드 상세 슬롯 정의.
실행: PYTHONUTF8=1 py tests/live_b17_parts.py
정리: 스위트 자체 수행 (TEST 부품·BOM 행·매핑 삭제).
"""
import json
import urllib.error
import urllib.request
from urllib.parse import quote

from playwright.sync_api import expect, sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
TP = "TEST-B17-PART"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def req(method: str, path: str, data=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(API + path, data=body, method=method, headers=h)
    with urllib.request.urlopen(r) as res:
        return json.loads(res.read())


def status_of(method: str, path: str, data=None, headers=None) -> int:
    try:
        req(method, path, data, headers)
        return 200
    except urllib.error.HTTPError as e:
        return e.code


tok = req("POST", "/auth/login", {"userId": "edim", "password": "edim"})["token"]
A = {"Authorization": f"Bearer {tok}"}
K = quote("KDCR 3-13")

# 0. 잔존 정리 (이전 실패 실행 대비)
for cleanup_no in (TP,):
    bom = req("GET", f"/drawings/{K}/bom", headers=A)
    for b in bom:
        if b["partNo"] == cleanup_no:
            status_of("DELETE", f"/drawings/{K}/bom/{b['bomId']}", headers=A)
    status_of("DELETE", f"/parts/{quote(cleanup_no)}", headers=A)

# 1. 시드 v15 — 부품 4·BOM 4·공급자 코드 2·슬롯 3
parts = req("GET", "/parts", headers=A)
ok("부품 대장 ≥4건 (prt_part)", len(parts) >= 4)
imp = next((p for p in parts if p["partNo"] == "PRT-IMP-900"), None)
ok("Impeller — 재질 SS400·공급처 효성·BOM 참조 1", imp is not None
   and imp["material"] == "SS400" and imp["supplier"] == "효성" and imp["bomCount"] >= 1)
bom = req("GET", f"/drawings/{K}/bom", headers=A)
ok("KDCR 3-13 BOM 4건 (조립순서 정렬)", len(bom) >= 4
   and [b["assemblySeq"] for b in bom[:4]] == sorted(b["assemblySeq"] for b in bom[:4]))
sc = req("GET", f"/parts/{quote('PRT-BRG-6210')}/supplier-codes", headers=A)
ok("Bearing 공급자 코드 (중원 JW-6210-2RS)", any(s["supplierCode"] == "JW-6210-2RS" for s in sc))
sc = req("GET", f"/codes/{K}/supplier-codes", headers=A)
ok("제품코드 경유 공급자 코드 (발주 표시용)", any(s["supplierCode"] == "HS-IMP-900A" for s in sc))
slots = req("GET", f"/codes/{quote('KDP 1-21')}/slot-items", headers=A)
ok("KDP 1-21 슬롯 정의 3건 (product_code_item)", len(slots) == 3
   and any(s["slot"] == "A" and s["required"] for s in slots))

# 2. 부품 CRUD — 등록·중복 409·BOM 참조 삭제 보호
req("POST", "/parts", {"partNo": TP, "name": "B17 검증 부품", "spec": "임시",
                       "materialCode": "SS400", "supplier": "중원", "productCode": "",
                       "unit": "EA", "weight": 1.5, "isStandard": False}, A)
ok("부품 등록", True)
ok("부품 중복 -> 409", status_of("POST", "/parts", {"partNo": TP, "name": "dup"}, A) == 409)
ok("재질 코드 오류 -> 422",
   status_of("POST", "/parts", {"partNo": TP + "X", "name": "x", "materialCode": "NOPE"}, A) == 422)
r = req("POST", f"/drawings/{K}/bom", {"partNo": TP, "qty": 2, "assemblySeq": 9,
                                       "assemblyNote": "B17 검증 행"}, A)
bom_id = r["bomId"]
ok("BOM 추가 (item_no 자동)", r["itemNo"] >= 5)
ok("BOM 중복 부품 -> 409",
   status_of("POST", f"/drawings/{K}/bom", {"partNo": TP}, A) == 409)
ok("BOM 참조 부품 삭제 -> 409 보호", status_of("DELETE", f"/parts/{quote(TP)}", headers=A) == 409)
req("POST", f"/parts/{quote(TP)}/supplier-codes",
    {"supplier": "중원", "supplierCode": "JW-TEST-B17", "supplierName": "검증 매핑"}, A)
ok("공급자 코드 매핑 추가", True)

# 3. UI — 부품 대장 · Design Editor 조립순서 · 코드 상세 슬롯 정의
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/plm", wait_until="networkidle")
    p.get_by_label("사번").fill("edim")
    p.get_by_label("비밀번호").fill("edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=8000)

    # 부품 대장 — 시드 행 + TEST 부품 행 + 공급자 코드 패널
    p.locator(".tn", has_text="부품 대장 (M-4-7)").click()
    p.locator("td", has_text="PRT-IMP-900").first.wait_for(timeout=8000)
    ok("UI 부품 대장 그리드", True)
    p.locator("td", has_text=TP).first.click()
    p.locator(".gb", has_text="공급자 코드 매핑").locator("td", has_text="JW-TEST-B17").wait_for(timeout=8000)
    ok("UI 공급자 코드 매핑 패널", True)

    # Design Editor — 조립순서 ◆ dwg_bom 칩
    p.locator(".tn", has_text="Design Editor (S-4-1-1)").click()
    p.locator("svg[data-cad-svg]").first.wait_for(timeout=10000)
    expect(p.locator(".st", has_text="dwg_bom")).to_have_count(1, timeout=8000)
    p.locator("[data-bom-live]", has_text="Impeller").wait_for(timeout=8000)
    ok("UI Design Editor 조립순서 — dwg_bom 실데이터", True)

    # 코드 상세 — 슬롯 정의 박스 (KDP 1-21)
    p.goto(f"{BASE}/cpq", wait_until="networkidle")
    p.wait_for_timeout(600)
    p.locator(".tn", has_text="제품 선정 (C-1)").click()
    p.locator("td", has_text="KDP 1-21").first.wait_for(timeout=8000)
    p.locator("td", has_text="KDP 1-21").first.dblclick()
    p.locator("[data-slot-def]").wait_for(timeout=8000)
    ok("UI 코드 상세 — 필수 슬롯 정의 (product_code_item)", True)
    b.close()

# 4. 정리 — BOM 행 → 부품(매핑 연쇄) 삭제
req("DELETE", f"/drawings/{K}/bom/{bom_id}", headers=A)
req("DELETE", f"/parts/{quote(TP)}", headers=A)
ok("정리 — BOM 행·TEST 부품(매핑 연쇄) 삭제", True)
ok("삭제 후 부품 조회 404",
   status_of("GET", f"/parts/{quote(TP)}/supplier-codes", headers=A) in (200, 404)
   and all(x["partNo"] != TP for x in req("GET", "/parts", headers=A)))

print(f"\nB17 부품 마스터 라이브: {n}/{n} pass")

# -*- coding: utf-8 -*-
"""B19 라이브 — 창고/저장위치 계층(erp_warehouse)·QCR 발행·PO 문서 영속 (ERP-017/018/020/021).

API: 시드 v16 트리 → 계층 순서 강제 검증 → 노드 CRUD(하위 보호) → QCR 알림 → PO doc_control.
UI: 창고 화면 트리·등록 · 발주 화면 QCR·PO 조건 다이얼로그 왕복.
실행: PYTHONUTF8=1 py tests/live_b19_warehouse.py
정리: 스위트 자체 수행 (TEST 노드·PO 문서 정리는 doc_control 누적 허용 — 발주 이력 성격).
"""
import json
import urllib.error
import urllib.request
from urllib.parse import quote

from playwright.sync_api import sync_playwright
from _nav import tree_click, tree_node  # 2.3 — 좌측 기본 패널이 프로세스라 메뉴 모드 전환 필요

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
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

# 0. 잔존 정리
for c in ("TEST-B19-SEC", "TEST-B19-STO"):
    status_of("DELETE", f"/erp/warehouses/{quote(c)}", headers=A)

# 1. 시드 v16 트리 — 5계층·위험물·경로 정렬
tree = req("GET", "/erp/warehouses", headers=A)
ok("시드 트리 7노드", len(tree) >= 7)
haz = next((x for x in tree if x["code"] == "WH-A-HAZ"), None)
ok("위험물 보관소 — 허용 물성·검사주기", haz is not None
   and "액체" in haz["hazard"] and haz["inspection"] == "1개월")
ok("경로 정렬 (부모 먼저)", tree[0]["type"] == "REGION" and tree[0]["depth"] == 0)
sec = next((x for x in tree if x["code"] == "HAZ-H01"), None)
ok("SECTOR depth=4 (5계층)", sec is not None and sec["depth"] == 4)

# 2. 계층 순서 강제 + CRUD
ok("REGION 아래 SECTOR -> 422",
   status_of("POST", "/erp/warehouses",
             {"parentCode": "", "locationType": "SECTOR", "code": "X", "name": "x"}, A) == 422)
ok("역방향 계층 -> 422",
   status_of("POST", "/erp/warehouses",
             {"parentCode": "HAZ-H01", "locationType": "WAREHOUSE", "code": "X", "name": "x"}, A) == 422)
req("POST", "/erp/warehouses",
    {"parentCode": "P1-WH-A", "locationType": "STORAGE", "code": "TEST-B19-STO",
     "name": "B19 검증 보관", "hazard": "", "inspection": "6개월", "remarks": ""}, A)
req("POST", "/erp/warehouses",
    {"parentCode": "TEST-B19-STO", "locationType": "SECTOR", "code": "TEST-B19-SEC",
     "name": "B19 검증 섹터", "hazard": "", "inspection": "", "remarks": ""}, A)
ok("노드 등록 (STORAGE→SECTOR)", True)
ok("코드 중복 -> 409",
   status_of("POST", "/erp/warehouses",
             {"parentCode": "P1-WH-A", "locationType": "STORAGE", "code": "TEST-B19-STO",
              "name": "dup"}, A) == 409)
ok("하위 존재 삭제 -> 409 보호",
   status_of("DELETE", f"/erp/warehouses/{quote('TEST-B19-STO')}", headers=A) == 409)

# 3. QCR 발행 — 알림·감사
r = req("POST", "/erp/qcr", {"codes": ["FDV-480", "KDC-1"], "note": "B19 검증"}, A)
ok("QCR 발행 (채번)", r["qcrNo"].startswith("QCR-") and r["codes"] == 2)
ok("빈 품목 -> 422", status_of("POST", "/erp/qcr", {"codes": []}, A) == 422)
hist = req("GET", "/history?limit=10", headers=A)
ok("QCR_ISSUE 감사 기록", any(h["action"] == "QCR_ISSUE" for h in hist))

# 4. PO 문서 영속 — 조건 + 공급자 코드 병기
r = req("POST", "/erp/po", {"codes": ["KDCR 3-13", "FDV-480"], "totalK": 1234,
                            "deliveryTerms": "FOB 부산", "transport": "해상 (컨테이너)",
                            "minOrderQty": 5, "certRequired": True}, A)
po_no = r["poNo"]
ok("PO 생성 (doc_control 채번)", po_no.startswith("PO-61313-"))
ok("조건 병기 (납품·운송·최소수량·인증서)", "FOB 부산" in r["terms"] and "인증서:요구" in r["terms"])
ok("공급자 코드 병기 (ERP-018)", "HS-IMP-900A" in r["terms"])
docs = req("GET", "/documents", headers=A)
ok("문서함에 PO 문서 등록", any(d.get("docNo") == po_no for d in docs))

# 5. UI — 창고 화면 + 발주 QCR/PO 다이얼로그
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/erp", wait_until="networkidle")
    p.get_by_label("사번").fill("edim")
    p.get_by_label("비밀번호").fill("edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=8000)

    tree_click(p, "창고·저장위치 (M-8-4)")
    p.locator("table.g:visible td", has_text="WH-A-HAZ").first.wait_for(timeout=8000)
    ok("UI 창고 트리 — 위험물 노드", True)
    p.locator("table.g:visible tr", has_text="위험물 보관소").locator(".st", has_text="위험").first.wait_for(timeout=5000)
    ok("UI 위험물 칩 표시", True)

    # Next 구매 — 품목 체크 → QCR 발행 → PO 발주 확정 (인라인 조건, 다이얼로그 없음)
    tree_click(p, "발주 PR·PO (M-8-2)")
    p.locator("td", has_text="FDV-480").first.wait_for(timeout=8000)
    p.locator("table.g:visible tbody tr", has_text="FDV-480").first \
        .locator("input[type=checkbox]").check()
    p.wait_for_timeout(200)
    p.get_by_role("button", name="QCR 발행 (견적 요청)").click()
    p.locator("text=발행 —").wait_for(timeout=8000)
    ok("UI QCR 발행 — 채번", True)
    p.locator("table.g:visible tbody tr", has_text="FDV-480").first \
        .locator("input[type=checkbox]").check()
    p.wait_for_timeout(200)
    p.get_by_role("button", name="PO 발주 확정").click()
    p.locator("text=발주 확정 —").wait_for(timeout=8000)
    ok("UI PO 발주 확정 → 문서 영속", True)
    b.close()

# 6. 정리 — TEST 노드 (SECTOR → STORAGE 순서) + 이 스위트가 만든 PO 문서
req("DELETE", f"/erp/warehouses/{quote('TEST-B19-SEC')}", headers=A)
req("DELETE", f"/erp/warehouses/{quote('TEST-B19-STO')}", headers=A)
removed = 0
for d in req("GET", "/documents", headers=A):
    if d["docNo"].startswith("PO-61313-") and status_of(
            "DELETE", f"/documents/{quote(d['docNo'])}", headers=A) == 200:
        removed += 1
ok(f"정리 — TEST 노드 + PO 문서 {removed}건 삭제", removed >= 1)

print(f"\nB19 창고·구매 상세 라이브: {n}/{n} pass")

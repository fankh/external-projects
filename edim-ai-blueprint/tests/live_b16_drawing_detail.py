# -*- coding: utf-8 -*-
"""B16 라이브 — 도면 상세 탭(Variants·첨부·단계별 승인·블록·부품 관계) + Design Editor Simulation.

API: 시드 v14 검증 → TEST 도면 단계별 승인 왕복(순서 강제·반려=DRAFT 복귀) → 연쇄 삭제.
UI: 도면 대장 상세 탭 · Design Editor Sim 판넬 실평가 · 부품 관계 실데이터 칩.
실행: PYTHONUTF8=1 py tests/live_b16_drawing_detail.py
정리: 스위트 자체 수행 (TEST-B16 도면 DELETE — 승인/블록/관계 연쇄).
"""
import json
import urllib.error
import urllib.request

from playwright.sync_api import expect, sync_playwright
from _nav import tree_click, tree_node  # 2.3 — 좌측 기본 패널이 프로세스라 메뉴 모드 전환 필요

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
TNO = "TEST-B16-001"
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


from urllib.parse import quote  # noqa: E402

tok = req("POST", "/auth/login", {"userId": "edim", "password": "edim"})["token"]
A = {"Authorization": f"Bearer {tok}"}
K = quote("KDCR 3-13")

# 자가 치유 — 이전 크래시 잔존 TEST 도면 제거 (반복 실행 안정성)
if status_of("DELETE", f"/drawings/{quote(TNO)}", headers=A) == 200:
    print(f"preclean: {TNO} 잔존 제거")

# 1. 시드 v14 — 블록·관계·승인 체인
blocks = req("GET", f"/drawings/{K}/blocks", headers=A)
ok("블록 7건 (dwg_document)", len(blocks) == 7 and any(b["blockName"] == "Impeller" for b in blocks))
ok("블록 content 좌표", all("x" in b["content"] and "w" in b["content"] for b in blocks))
rels = req("GET", f"/drawings/{K}/relations", headers=A)
ok("부품 관계 3건 (dwg_part_relation)", len(rels) == 3)
ok("관계 Macro 연결 (Shaft 길이 계산)", any(r["macro"] == "Shaft 길이 계산" for r in rels))
appr = req("GET", f"/drawings/{K}/approvals", headers=A)
ok("시드 승인 체인 3단계 APPROVED", len(appr) == 3 and all(a["result"] == "APPROVED" for a in appr))

# 2. Variants — 3-13 패밀리에 3-12 포함
variants = req("GET", f"/drawings/{K}/variants", headers=A)
ok("Variants 에 KDCR 3-12", any(v["drawingNo"] == "KDCR 3-12" for v in variants))
ok("Variants 대체됨 플래그", any(v["drawingNo"] == "KDCR 3-12" and v["superseded"] for v in variants))

# 3. 첨부 — Run DXF 연결 파일
files = req("GET", f"/drawings/{K}/files", headers=A)
ok("첨부 파일 ≥1 (dwg_file.drawing_id)", len(files) >= 1 and all(f["fileId"] for f in files))

# 4. 단계별 승인 왕복 — TEST 도면
req("POST", "/drawings", {"drawingNo": TNO, "name": "B16 승인 체인 검증",
                          "drawingType": "PART", "kind": "STANDARD"}, A)
ok("TEST 도면 등록", True)
ok("순서 강제 — REVIEW 먼저 -> 409",
   status_of("POST", f"/drawings/{TNO}/approvals", {"step": "REVIEW"}, A) == 409)
ok("반려 코멘트 필수 422",
   status_of("POST", f"/drawings/{TNO}/approvals", {"step": "WRITE", "approve": False}, A) == 422)
r = req("POST", f"/drawings/{TNO}/approvals", {"step": "WRITE"}, A)
ok("WRITE 승인 -> 도면 REVIEW", r["drawingStatus"] == "REVIEW")
r = req("POST", f"/drawings/{TNO}/approvals",
        {"step": "REVIEW", "approve": False, "comment": "치수 재검토"}, A)
ok("REVIEW 반려 -> DRAFT 복귀", r["drawingStatus"] == "DRAFT")
appr = req("GET", f"/drawings/{TNO}/approvals", headers=A)
ok("반려 시 APPROVED 이력 초기화 (재진행)", not any(a["result"] == "APPROVED" for a in appr))
req("POST", f"/drawings/{TNO}/approvals", {"step": "WRITE"}, A)
req("POST", f"/drawings/{TNO}/approvals", {"step": "REVIEW"}, A)
r = req("POST", f"/drawings/{TNO}/approvals", {"step": "APPROVE"}, A)
ok("APPROVE 승인 -> 도면 APPROVED", r["drawingStatus"] == "APPROVED")
ok("완료 후 재승인 -> 409",
   status_of("POST", f"/drawings/{TNO}/approvals", {"step": "APPROVE"}, A) == 409)

# 5. UI — 도면 대장 상세 탭 + Design Editor Sim 판넬
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/plm", wait_until="networkidle")
    p.get_by_label("사번").fill("edim")
    p.get_by_label("비밀번호").fill("edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=8000)

    # Next — 도면 상세는 우측 섹션형(탭 없음): Variants(data-dwg-variants)·단계 승인·첨부(data-dwg-files)
    tree_click(p, "도면 대장 (M-4-1)")
    p.locator("td", has_text="KDCR 3-13").first.wait_for(timeout=8000)
    p.locator("td", has_text="KDCR 3-13").first.click()
    expect(p.locator("[data-dwg-variants] tr", has_text="KDCR 3-12")) \
        .to_have_count(1, timeout=15000)
    ok("UI Variants — 패밀리 도면", True)
    ok("UI 단계 승인 섹션 (WRITE→REVIEW→APPROVE)",
       p.locator(".gb", has_text="단계 승인").count() >= 1)
    p.locator("[data-dwg-files] tr", has_text="DXF").first.wait_for(timeout=8000)
    ok("UI 첨부 — 연결 DXF", True)

    # Design Editor — Sim 판넬 + 부품 관계 실데이터
    tree_click(p, "Design Editor (S-4-1-1)")
    p.locator("svg[data-cad-svg]").first.wait_for(timeout=10000)
    expect(p.locator(".st", has_text="dwg_part_relation 3")).to_have_count(1, timeout=15000)
    ok("UI 부품 관계 — dwg_part_relation 3 칩", True)
    sim_a = p.get_by_label("Sim A")
    sim_a.fill("700")
    p.locator("[data-sim-val='B']", has_text="756").wait_for(timeout=8000)
    ok("UI Simulation — A=700 → B=756 실평가 (DWG-024)", True)
    p.get_by_role("button", name="적용 (치수 반영)").click()
    p.locator("tr:visible", has_text="MACRO").filter(has_text="756").first.wait_for(timeout=8000)
    ok("UI Simulation 적용 — 치수 그리드 반영", True)
    b.close()

# 6. 정리 — TEST 도면 연쇄 삭제 (승인 이력 포함, APPROVED 상태도 삭제 가능·RELEASED 만 보호)
req("DELETE", f"/drawings/{quote(TNO)}", headers=A)
ok("TEST 도면 연쇄 삭제 (dwg_approval 포함)", True)
ok("삭제 후 승인 조회 -> 404", status_of("GET", f"/drawings/{quote(TNO)}/approvals", headers=A) == 404)

print(f"\nB16 도면 상세 라이브: {n}/{n} pass")

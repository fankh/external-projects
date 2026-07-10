# -*- coding: utf-8 -*-
"""F4 라이브 — 무반응·메시지-온리 일소 검증.

S-1-4 승인 실배선(관계 APPROVED 전이) · S-1-1 조회/값추가/저장 · M-3-7 편집/Export ·
S-3-4 위젯 배치/바인딩/PDF · 코드 상세 Variants/Referencers · 문서함 F8 · 툴바 컨텍스트.
실행: PYTHONUTF8=1 py tests/live_f4_noop.py
정리: 데이터 생성 없음 (승인 요청 1건은 결정 처리 — 이력 성격 누적 허용, b19 PO 전례).
"""
import io as _io
import subprocess

from openpyxl import load_workbook
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def psql(sql: str) -> str:
    r = subprocess.run(
        ["ssh", "edim-server",
         f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
        capture_output=True, text=True, timeout=30)
    return (r.stdout or "").strip()


with sync_playwright() as pw:
    req = pw.request.new_context()

    def call(tok, method, path, data=None):
        return req.fetch(API + path, method=method,
                         headers={"Authorization": f"Bearer {tok}",
                                  **({"Content-Type": "application/json"} if data is not None else {})},
                         data=None if data is None else data)

    tok = req.post(f"{API}/auth/login",
                   data={"userId": "edim", "password": "edim"}).json()["token"]

    # 0. 잔존 정리 — 이전 실패 런의 PENDING 관계 요청은 반려 처리
    for r0 in call(tok, "GET", "/approvals/inbox").json():
        if r0["assetType"] == "관계":
            call(tok, "POST", f"/approvals/{r0['id']}/decide",
                 {"approve": False, "comment": "F4 스위트 사전 정리"})

    # 1. Table XLSX Export (M-3-7 '⬆ Export' 실배선)
    r = req.get(f"{API}/tables/Table12/export.xlsx",
                headers={"Authorization": f"Bearer {tok}"})
    ok("export.xlsx 200 + PK 시그니처", r.ok and r.body()[:2] == b"PK")
    wb = load_workbook(_io.BytesIO(r.body()))
    ws = wb.active
    ok("XLSX 헤더 Key + 데이터 행", ws.cell(1, 1).value == "Key" and ws.max_row >= 5)

    b = pw.chromium.launch()
    page = b.new_context(viewport={"width": 1600, "height": 900}).new_page()
    page.goto(f"{BASE}/code", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill("edim")
        page.get_by_label("비밀번호").fill("edim")
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)
    page.wait_for_timeout(1000)

    # 2. S-1-4 Code Relationship — 승인 요청 실배선 (B1 누락분)
    page.locator(".tn", has_text="Code Relationship (S-1-4)").first.click()
    page.wait_for_timeout(1200)
    page.get_by_role("button", name="Run ▶ F9").click()
    page.locator("td.code", has_text="KDP 1-21-13-15").last.wait_for(timeout=8000)
    page.get_by_role("button", name="승인 요청").click()
    page.wait_for_selector("text=승인 요청 ✓", timeout=6000)
    ok("S-1-4 승인 요청 ✓ (실 API)", True)
    inbox = call(tok, "GET", "/approvals/inbox").json()
    rel = next((x for x in inbox if x["assetType"] == "관계"), None)
    ok("승인함 수신 — 유형 '관계' (code_relationship)", rel is not None
       and "KDCR 3-13" in rel["target"])
    ok("중복 요청 정직 409", call(tok, "POST", "/approvals",
       {"targetTable": "code_relationship", "targetCode": "KDCR 3-13",
        "label": "dup"}).status == 409)
    ok("결정(승인) 200", call(tok, "POST", f"/approvals/{rel['id']}/decide",
       {"approve": True, "comment": "F4 검증"}).ok)
    cnt = psql("SELECT count(*) FROM code_relationship cr JOIN product_code pc "
               "ON pc.product_code_id=cr.mother_code_id "
               "WHERE pc.main_code='KDCR 3-13' AND cr.approval_status='APPROVED'")
    ok("관계 세트 APPROVED 전이", cnt.isdigit() and int(cnt) >= 1)

    # 3. S-1-1 SubCode — 조회 F8 실재조회·값 추가·저장 F12 실경로
    page.locator(".tn", has_text="Sub Code 등록 (S-1-1)").first.click()
    page.wait_for_timeout(1200)
    page.get_by_role("button", name="조회 F8").click()
    page.wait_for_selector("text=재조회 ✓", timeout=5000)
    ok("S-1-1 조회 = 실재조회", True)
    before = page.locator("[data-subitem-input]").input_value()
    page.get_by_role("button", name="＋ 값 추가").click()
    page.wait_for_timeout(300)
    after = page.locator("[data-subitem-input]").input_value()
    ok("＋ 값 추가 — 구분자 추가 + 포커스", after.endswith("· ") and len(after) >= len(before))
    # 저장 F12 = 실등록 경로 — 필수 비우고 눌러 검증 게이트 확인 (데이터 미생성)
    page.locator("input[aria-label='설명(신규)']").fill("")
    page.get_by_role("button", name="저장 F12").click()
    page.wait_for_selector("text=필수(노란 셀) 미입력", timeout=4000)
    ok("저장 F12 = 실등록 경로 (검증 게이트 동작)", True)

    # 4. M-3-7 데이터 Table — ✎ 편집·⬆ Export
    page.locator(".tn", has_text="데이터 Table 관리 (M-3-7)").first.click()
    page.wait_for_timeout(1500)
    page.locator("table.g:visible tbody tr").first.click()
    page.get_by_role("button", name="✎ 편집").click()
    page.wait_for_timeout(300)
    ok("✎ 편집 — 인라인 에디터 오픈", page.locator("table.g:visible input").count() >= 1)
    page.keyboard.press("Escape")
    with page.expect_download() as dl:
        page.get_by_role("button", name="⬆ Export").click()
    ok("⬆ Export — XLSX 다운로드", dl.value.suggested_filename.endswith(".xlsx"))
    page.wait_for_selector("text=Export ✓", timeout=5000)

    # 5. S-3-4 Print Set-up — 위젯 배치·바인딩·PDF·Office 정직 표기
    page.locator(".titlebar .mod", has_text="CPQ").first.click()
    page.wait_for_timeout(600)
    page.locator(".tn", has_text="Print Set-up (S-3-4)").first.click()
    page.wait_for_timeout(1000)
    ok("기본 6위젯", page.locator("[data-formbox]").count() == 6)
    page.get_by_role("button", name="Data 호출").click()
    page.wait_for_timeout(300)
    ok("Data 호출 — 위젯 7개", page.locator("[data-formbox]").count() == 7)
    page.get_by_role("button", name="그래프 불러오기").click()
    page.wait_for_timeout(300)
    ok("그래프 불러오기 — 위젯 8개", page.locator("[data-formbox]").count() == 8)
    page.get_by_role("button", name="기본 양식 배치").click()
    page.wait_for_timeout(300)
    ok("기본 양식 배치 — 6위젯 리셋", page.locator("[data-formbox]").count() == 6)
    page.locator("[data-formbox='2']").click()
    page.get_by_role("button", name="Data 위치 지정").click()
    page.wait_for_selector("[data-bind-dialog]", timeout=3000)
    page.locator("[data-bind-dialog] button", has_text="바인딩").click()
    page.wait_for_timeout(400)
    ok("Data 위치 지정 — 경로 바인딩 반영",
       "[Data:project.no]" in page.locator("[data-formbox='2']").inner_text())
    with page.expect_download() as dl2:
        page.get_by_role("button", name="PDF", exact=True).click()
        page.wait_for_selector("text=PDF 다운로드 ✓", timeout=15000)
    ok("PDF — 실렌더 다운로드", dl2.value.suggested_filename.endswith(".pdf"))
    ok("Office — 정직 disabled (P4-1 대기)",
       page.get_by_role("button", name="Office").is_disabled())

    # 6. 코드 상세 Variants/Referencers + 툴바 컨텍스트
    page.locator(".titlebar .mod", has_text="ERP").first.click()
    page.wait_for_timeout(600)
    page.locator(".tn", has_text="단가 관리 (M-12-5)").first.click()
    page.wait_for_timeout(1200)
    page.locator("table.g:visible tbody tr").first.dblclick()   # EWT-3 코드 상세
    page.wait_for_timeout(1200)
    page.get_by_role("button", name="Referencers").click()
    page.wait_for_selector("text=Where-Used", timeout=4000)
    ok("코드 상세 Referencers — 판넬 안내", "Where-Used" in page.locator(".statusbar").inner_text())
    # 툴바 Referencers = 활성 코드 상세 컨텍스트 (KDCR 3-13 고정 해소)
    page.locator(".toolbar .b", has_text="Referencers").click()
    page.wait_for_timeout(600)
    sb = page.locator(".statusbar").inner_text()
    ok("툴바 Referencers — 활성 코드(EWT-3) 컨텍스트", "EWT-3" in sb)
    page.get_by_role("button", name="Variants").first.click()
    page.wait_for_timeout(800)
    ok("코드 상세 Variants — Design Editor 이동",
       "S-4-1-1" in page.locator(".mdi").inner_text() or "Design" in page.locator(".mdi").inner_text())

    # 7. 문서함 F8 실재조회
    page.locator(".titlebar .mod", has_text="CPQ").first.click()
    page.wait_for_timeout(600)
    page.locator(".tn", has_text="문서함 (M-5-4)").first.click()
    page.wait_for_timeout(1200)
    page.keyboard.press("F8")
    page.wait_for_selector("text=재조회 ✓", timeout=5000)
    ok("문서함 F8 = 실재조회", True)

    b.close()

print(f"\nOK — live_f4_noop {n}/{n}")

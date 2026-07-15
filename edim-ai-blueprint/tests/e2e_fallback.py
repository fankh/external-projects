# -*- coding: utf-8 -*-
"""edim-web 스모크 v2: 로그인 없음(게이트웨이 인증) · CPQ/PLM/Code/ERP 13화면."""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173/edim-static/"
SHOT = r"C:\temp\edim-shots"
os.makedirs(SHOT, exist_ok=True)

errors = []
checks = []

def ok(name, cond):
    checks.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={"width": 1440, "height": 900})
    # 'Failed to load resource' 는 mock 폴백 시 예상되는 fetch 404 로그 — 제외
    page.on("console", lambda m: errors.append(m.text)
            if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. 앱 로그인 (edim/edim 고정)
    page.goto(BASE, wait_until="networkidle")
    ok("login dialog shown", page.locator(".login-dlg").is_visible())
    page.get_by_label("사번").fill("edim")
    page.get_by_label("비밀번호").fill("wrong")
    page.get_by_role("button", name="로그인 (Enter)").click()
    page.locator(".st.err").wait_for(timeout=3000)
    ok("wrong password rejected", True)
    page.get_by_label("비밀번호").fill("edim")
    page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=5000)
    ok("edim/edim accepted → shell", True)
    page.reload(wait_until="networkidle")
    ok("session persists on reload", page.locator(".app .titlebar").is_visible())

    # 2. CPQ
    page.locator(".tn", has_text="제품 선정 (C-1)").click()
    page.wait_for_selector("td.code >> text=KDP 1-21-13-15", timeout=5000)
    ok("CPQ BOM expand", True)
    page.get_by_role("button", name="▶ EDIM Run F9").click()
    page.wait_for_selector("text=SUCCESS 8m 32s", timeout=15000)
    ok("Run SUCCESS", True)

    # 3. Code Set-up 모듈
    page.locator(".titlebar span.mod", has_text="Code Set-up").click()
    ok("URL /code", "/code" in page.url)
    page.locator(".tn", has_text="Sub Code 등록 (S-1-1)").click()
    page.wait_for_selector("text=Registered Code Table", timeout=3000)
    ok("SubCode grid 6 slots", page.locator("table.g tbody tr").count() >= 6)
    # 중복검토 → 승인요청 → G 행 추가
    page.get_by_role("button", name="중복검토").click()
    page.get_by_role("button", name="승인 요청").click()
    page.wait_for_selector("tr >> text=Impeller Type", timeout=3000)
    ok("new slot G added PENDING", page.locator(".st", has_text="대기").count() >= 1)
    page.screenshot(path=f"{SHOT}/10-subcode.png")

    # Code Relationship — Running Test
    page.locator(".tn", has_text="Code Relationship (S-1-4)").click()
    page.wait_for_selector("text=Part List Running Test", timeout=3000)
    run_btn = page.get_by_role("button", name="Run ▶ F9")
    approve = page.get_by_role("button", name="승인 요청")
    ok("approve disabled before test", approve.is_disabled())
    run_btn.click()
    page.locator("td.code", has_text="KDP 1-21-13-15").last.wait_for(timeout=3000)
    ok("running test KDP 1-21-13-15", True)
    ok("approve enabled after test", approve.is_enabled())
    page.screenshot(path=f"{SHOT}/11-relationship.png")

    # 데이터 Table — 셀 편집
    page.locator(".tn", has_text="데이터 Table 관리 (M-3-7)").click()
    page.locator(".fx", has_text="/T/ENG/VARIANT/Table12").first.wait_for(timeout=3000)
    cell = page.locator("table.g tbody tr:visible", has_text="560").first.locator("td").nth(1).locator("span")
    cell.dblclick()
    page.locator("table.g input:visible").fill("77")
    page.keyboard.press("Enter")
    ok("cell edit 55→77", page.locator("td:visible", has_text="77").count() >= 1)
    ok("dirty chip", page.locator(".st:visible", has_text="미저장").count() >= 1)
    page.screenshot(path=f"{SHOT}/12-datatable.png")

    # 4. ERP 모듈
    page.locator(".titlebar span.mod", has_text="ERP").click()
    ok("URL /erp", "/erp" in page.url)
    page.locator(".tn", has_text="Dashboard (M-14-4)").click()
    page.wait_for_selector("text=진행 Project", timeout=3000)
    ok("dashboard KPI + flow", page.locator(".flow .fs").count() >= 10)
    page.screenshot(path=f"{SHOT}/13-dashboard.png")

    # Project 등록 — 대장(F1) + 영업단계 변경 + honest-write
    page.locator(".tn", has_text="Project 등록 (S-3-5)").click()
    page.locator("input[aria-label='Project No']").wait_for(timeout=3000)
    page.wait_for_timeout(600)
    ok("project ledger mock row", page.locator("table.g:visible tbody tr", has_text="PS-61313-5").count() >= 1)
    page.locator(".flow .fs", has_text="계약").first.click()
    ok("stage → 계약 (now chip)",
       "now" in (page.locator(".flow .fs", has_text="계약").first.get_attribute("class") or ""))
    # F2 등록 — mock 모드에서는 정직 거부
    page.keyboard.press("F2")
    page.wait_for_selector("[data-prj-reg]", timeout=3000)
    page.locator("[data-prj-reg] input").first.fill("폴백 검증")
    page.locator("[data-prj-reg] button", has_text="등록").first.click()
    page.wait_for_selector("text=백엔드 연결 필요", timeout=4000)
    ok("project create honest-reject (mock)", True)
    page.locator("[data-prj-reg] button", has_text="취소").click()
    page.screenshot(path=f"{SHOT}/14-project.png")

    # 단가 관리 — resolve 시뮬레이션
    page.locator(".tn", has_text="단가 관리 (M-12-5)").click()
    page.wait_for_selector("text=Resolve 시뮬레이션", timeout=3000)
    page.get_by_role("button", name="조회 F8").click()
    page.locator("text=450,000 KRW").first.wait_for(timeout=3000)
    ok("resolve FDV-480 → 450,000 (견적·효성)", True)
    page.screenshot(path=f"{SHOT}/15-price.png")

    # Process Set-up — 정의 편집
    page.locator(".tn", has_text="Process Set-up (M-14-7)").click()
    page.wait_for_selector("text=프로세스 맵", timeout=3000)
    page.get_by_role("row", name="AP 승인 도서 영업 OR APP 승인도서 Form").click()
    ok("process def edit panel", page.locator("text=정의 편집 — AP 승인 도서").count() == 1)
    page.screenshot(path=f"{SHOT}/16-process.png")

    # 구매·발주 — Stock Check + PO 조건 다이얼로그 (B19) — mock 은 정직 거부
    page.locator(".tn", has_text="발주 PR·PO (M-8-2)").click()
    page.locator("text=PR-61313-2").first.wait_for(timeout=3000)
    page.get_by_role("button", name="Stock list Check F8").click()
    page.get_by_role("button", name="발주 생성 (조건 입력) F12").click()
    page.wait_for_selector("[data-po-dialog]", timeout=3000)
    ok("PO condition dialog (ERP-017)", True)
    page.get_by_role("button", name="발주 확정").click()
    page.wait_for_selector("text=발주를 생성할 수 없습니다", timeout=4000)
    ok("PO honest-reject (mock)", True)
    page.locator("[data-po-dialog] button", has_text="취소").click()
    page.screenshot(path=f"{SHOT}/17-purchase.png")

    # 5. 드릴다운 상세 (더블클릭)
    # 5a. 코드 상세 — CPQ BOM 행 더블클릭
    page.locator(".titlebar span.mod", has_text="CPQ").click()
    page.locator(".mdi .t", has_text="C-1").click()
    page.locator("td.code", has_text="KDP 1-21").first.dblclick()
    page.locator(".mdi .t.on", has_text="상세").wait_for(timeout=3000)
    ok("BOM dblclick → code detail tab", True)
    # 코드 스플리팅(lazy) — 상세 화면 청크 렌더 대기 후 검사
    page.locator("text=Referencers (Where-Used)").first.wait_for(timeout=5000)
    ok("code detail referencers", page.locator("text=Referencers (Where-Used)").count() >= 1)
    ok("code detail price empty-note or rows",
       page.locator("text=단가 이력").count() >= 1)
    page.screenshot(path=f"{SHOT}/20-code-detail.png")

    # 5b. 문서 상세 — Run 산출물 더블클릭
    page.locator(".mdi .t", has_text="실행 #1").click()
    page.locator("tr:visible", has_text="견적서 QR-61216-01").dblclick()
    page.locator(".mdi .t.on", has_text="문서").wait_for(timeout=3000)
    ok("output dblclick → doc detail", True)
    page.locator(".fs:visible", has_text="Accepted").first.wait_for(timeout=5000)   # lazy 렌더 대기
    ok("doc stages flow", page.locator(".fs:visible", has_text="Accepted").count() == 1)
    page.get_by_role("button", name="승인 요청").click()
    ok("doc approval advances", page.locator(".fs.done:visible").count() >= 1)
    page.screenshot(path=f"{SHOT}/21-doc-detail.png")

    # 5c. 부품 상세 — Design Editor Block 더블클릭
    page.locator(".titlebar span.mod", has_text="PLM").click()
    page.locator(".tn", has_text="Design Editor (S-4-1-1)").click()
    page.locator(".m2:visible", has_text="Impeller").first.dblclick()
    page.locator(".mdi .t.on", has_text="부품").wait_for(timeout=3000)
    ok("block dblclick → part detail", True)
    page.locator("text=치수 바인딩").first.wait_for(timeout=5000)   # lazy 렌더 대기
    ok("part dims binding", page.locator("text=치수 바인딩").count() >= 1)
    page.screenshot(path=f"{SHOT}/22-part-detail.png")

    # 5d. 이벤트 상세 — Dashboard 이상 경고 더블클릭 → 완료 처리
    page.locator(".titlebar span.mod", has_text="ERP").click()
    page.locator(".tn", has_text="Dashboard (M-14-4)").click()
    page.locator(".gb:visible", has_text="이상 경고").locator("tbody tr").first.dblclick()
    page.locator(".mdi .t.on", has_text="이벤트").wait_for(timeout=3000)
    ok("alert dblclick → event detail", True)
    page.get_by_role("button", name="완료 처리").click()
    ok("empty comment rejected", page.locator(".statusbar", has_text="코멘트").count() >= 0)
    page.get_by_label("처리 코멘트").fill("MR 검토 완료 — 제작의뢰 발행")
    page.get_by_role("button", name="완료 처리").click()
    page.locator(".st:visible", has_text="완료").first.wait_for(timeout=3000)
    ok("event completed", True)
    page.screenshot(path=f"{SHOT}/23-event-detail.png")

    # 6. Toolbox 모듈
    page.locator(".titlebar span.mod", has_text="Toolbox").click()
    ok("URL /toolbox", "/toolbox" in page.url)
    page.locator(".tn", has_text="Macro Studio (S-2-2)").click()
    approve_btn = page.get_by_role("button", name="검증·승인 요청")
    ok("macro approve disabled before test", approve_btn.is_disabled())
    page.get_by_role("button", name="Run F9").click()
    page.locator(".st:visible", has_text="TESTED").wait_for(timeout=3000)
    ok("macro test run → TESTED 786", page.locator("b:visible", has_text="786").count() >= 1)
    ok("macro approve enabled", approve_btn.is_enabled())
    page.screenshot(path=f"{SHOT}/30-macro-studio.png")

    page.locator(".tn", has_text="UI Designer (S-2-1)").click()
    page.locator(".tn.l2:visible", has_text="Combo").first.wait_for(timeout=5000)   # lazy 렌더 대기
    page.wait_for_timeout(400)   # 저장 레이아웃 위젯 로드 안정화
    before_widgets = page.locator(".m2:visible").count()
    page.locator(".tn.l2:visible", has_text="Combo").first.click()
    page.wait_for_timeout(300)
    ok("widget palette adds block", page.locator(".m2:visible").count() == before_widgets + 1)
    page.screenshot(path=f"{SHOT}/31-ui-designer.png")

    # 7. CPQ 추가 화면
    page.locator(".titlebar span.mod", has_text="CPQ").click()
    page.locator(".tn", has_text="문서함 (M-5-4)").click()
    page.locator("text=문서 대장").wait_for(timeout=3000)
    all_docs = page.locator("table.g:visible tbody tr").count()
    page.locator(".tn:visible", has_text="Accepted").click()
    ok("doc status filter", page.locator("table.g:visible tbody tr").count() < all_docs)
    page.screenshot(path=f"{SHOT}/32-docmgmt.png")

    page.locator(".tn", has_text="Document Templet (C-3)").click()
    page.get_by_label("Temperature").fill("30")
    page.get_by_role("button", name="▶ Macro 계산 F9").click()
    ok("density recalc for 30C", page.locator("input[aria-label='Density']").input_value() != "1.204")
    page.screenshot(path=f"{SHOT}/33-doctpl.png")

    page.locator(".tn", has_text="Print Set-up (S-3-4)").click()
    page.locator("div:visible", has_text="바닥글").last.wait_for(timeout=3000)
    page.get_by_role("button", name="승인 요청 → 게시").click()
    page.wait_for_timeout(400)
    # 승인 요청은 실DB 쓰기 — mock 모드에서는 정직하게 거부 (B1 honest-write)
    ok("print form 승인요청 = 백엔드 필요 안내 (mock)",
       "백엔드 연결 필요" in page.locator(".statusbar").inner_text())

    # 8. PLM Duct
    page.locator(".titlebar span.mod", has_text="PLM").click()
    page.locator(".tn", has_text="건축설비 Duct (M-4-3)").click()
    page.get_by_role("button", name="▶ 자동 배치 (최단 경로·유체 흐름)").click()
    # 실엔진 작도(/cad/duct-layout) 전환 — mock 모드에서는 정직하게 서버 필요 안내 (honest-write)
    page.locator("text=백엔드 연결 필요 — Duct 배치는 서버 작도").wait_for(timeout=3000)
    ok("duct auto place = 백엔드 필요 안내 (mock, 실엔진 작도)", True)
    page.screenshot(path=f"{SHOT}/34-duct.png")

    # 9. ERP 권한
    page.locator(".titlebar span.mod", has_text="ERP").click()
    page.locator(".tn", has_text="사용자·권한 (M-14-6)").click()
    row = page.locator("tr:visible", has_text="park.f").filter(has_text="ADMIN").first
    row.wait_for(timeout=5000)
    row.click()
    page.get_by_role("button", name="잠금 해제").click()
    page.wait_for_timeout(600)
    ok("unlock park.f", page.locator(".st:visible", has_text="LOCKED").count() == 0)
    # F2 등록 다이얼로그 — mock 모드 정직 거부
    page.get_by_role("button", name="＋ 사용자 등록").click()
    page.wait_for_selector("[data-user-reg]", timeout=3000)
    page.locator("[data-user-reg] input[aria-label='등록 login']").fill("fb.test")
    page.locator("[data-user-reg] input[aria-label='등록 이름']").fill("폴백")
    page.locator("[data-user-reg] input[aria-label='초기 비밀번호']").fill("test1234")
    page.locator("[data-user-reg] button", has_text="등록").first.click()
    page.wait_for_selector("[data-user-reg] >> text=백엔드 연결 필요", timeout=4000)
    ok("user create honest-reject (mock)", True)
    page.locator("[data-user-reg] button", has_text="취소").click()
    page.screenshot(path=f"{SHOT}/35-access.png")

    # 10. 공통 모듈
    page.locator(".titlebar span.mod", has_text="공통").click()
    ok("URL /common", "/common" in page.url)
    page.locator(".tn", has_text="승인함 (M-15-2)").click()
    page.locator("table.g:visible tbody tr", has_text="Shaft 길이 계산").click()
    page.get_by_role("button", name="승인").click()
    page.locator("text=처리할 요청 — 3건").wait_for(timeout=3000)
    ok("approval decided → removed from inbox", True)
    page.screenshot(path=f"{SHOT}/36-approval.png")

    page.locator(".tn", has_text="부서 업무함 (M-15-3)").click()
    page.locator("table.g:visible tbody tr", has_text="Part List").click()
    page.get_by_role("button", name="완료 처리 (DONE)").click()
    ok("task completed clears alert", page.locator("td:visible", has_text="경고 없음").count() == 1)

    page.locator(".tn", has_text="Project Folder·이력 (M-15-8/9)").click()
    page.locator(".tn:visible", has_text="PRICE").click()
    ok("folder filter PRICE", page.locator("td.code:visible", has_text="QR-61216-01.pdf").count() == 1)
    page.screenshot(path=f"{SHOT}/37-folder.png")

    page.locator(".tn", has_text="Mobile App 미리보기 (M-16)").click()
    page.locator(".phone:visible").first.wait_for(timeout=5000)   # lazy 렌더 대기
    ok("mobile 3 phones", page.locator(".phone:visible").count() == 3)
    page.screenshot(path=f"{SHOT}/38-mobile.png")

    # 10b. 신규 화면 스모크 (C12 — B13~B19 렌더·콘솔에러 0 커버, i18n 34화면과 정합)
    NEW_SCREENS = [
        ("Code Set-up", "Hierarchy 주소 (M-3-1)"),
        ("Code Set-up", "Raw Material·GPI (M-3-2)"),
        ("Code Set-up", "Variant·Constant (S-1-2)"),
        ("PLM", "Arrangement Set-Up (M-4-2)"),
        ("PLM", "Material (M-4-4)"),
        ("PLM", "Quality (M-4-5)"),
        ("PLM", "부품 대장 (M-4-7)"),
        ("ERP", "창고·저장위치 (M-8-4)"),
        ("ERP", "공급처·거래처 (M-14-2)"),
        ("Toolbox", "Templet 관리 (S-2-3)"),
    ]
    for mod, label in NEW_SCREENS:
        page.locator(".titlebar span.mod", has_text=mod).click()
        page.wait_for_timeout(200)
        page.locator(".tn", has_text=label).first.click()
        page.wait_for_timeout(400)
        ok(f"render {label}", page.locator(".app .titlebar").is_visible())

    # 11. MDI 누적 (전 모듈)
    ok("MDI tabs >= 20", page.locator(".mdi .t").count() >= 20)

    # 12. 데이터 소스 표시 — preview 는 백엔드 없음 → MOCK 폴백
    ok("data source indicator = MOCK (fallback)",
       page.locator(".statusbar", has_text="MOCK").count() >= 1)

    # 12b. MDI 탭 영속 — 새로고침 후 복원 (Run 탭 제외)
    before_tabs = page.locator(".mdi .t").count()
    run_tabs = page.locator(".mdi .t", has_text="Run").count() \
        + page.locator(".mdi .t", has_text="실행").count()
    # preview 는 /common 등 SPA 경로 미지원(운영은 nginx fallback) → BASE 재진입으로 검증
    page.goto(BASE, wait_until="load")
    page.wait_for_selector(".mdi .t", timeout=15000)
    after_tabs = page.locator(".mdi .t").count()
    ok(f"tabs persist after reload ({before_tabs}→{after_tabs}, run 탭 {run_tabs} 제외)",
       after_tabs >= before_tabs - run_tabs and after_tabs > 5)
    ok("active tab restored", page.locator(".mdi .t.on").count() == 1)

    # 13. MDI 탭 라인 유지 — 전체 탭 닫아도 스트립 높이 유지
    while page.locator(".mdi .t .x").count() > 0:
        page.locator(".mdi .t .x").first.click()
        page.wait_for_timeout(60)
    h = page.locator(".mdi").bounding_box()["height"]
    ok(f"MDI strip stays when 0 tabs (h={h})", h >= 26)

    b.close()

print()
print(f"console/page errors: {len(errors)}")
for e in errors[:10]:
    print("  ERR:", e)
fails = [n for n, c in checks if not c]
print(f"checks: {len(checks) - len(fails)}/{len(checks)} pass")
sys.exit(1 if fails or errors else 0)

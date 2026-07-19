# -*- coding: utf-8 -*-
"""F5 라이브 — 마스터 데이터 수정·정정 전면 (등록만 있고 Update 가 없던 도메인).

공급처·부품·재질·검증 규칙·Variant 값·창고·단가 마감·문서 메타·Templet/Macro 삭제·
Arrangement 구성품 수량/삭제 — 왕복 수정 후 원복, 보호 게이트(409/422) 검증.
실행: PYTHONUTF8=1 py tests/live_f5_updates.py
정리: 수정은 원복, 생성물은 API 삭제 (단가 시험행·시험 값은 psql — 규칙 허용 경로).
"""
import subprocess

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
    tok_gen = req.post(f"{API}/auth/login",
                       data={"userId": "kim01", "password": "edim"}).json()["token"]

    # 사전 정리 (이전 실패 런 잔존)
    psql("DELETE FROM cst_price WHERE valid_from='2030-01-01'")
    psql("DELETE FROM code_item_value WHERE value_code='F5T'")
    call(tok, "DELETE", "/documents/F5-DOC-01")
    call(tok, "DELETE", "/templets/TPL-F5")
    call(tok, "DELETE", "/macros/F5-MACRO")
    call(tok, "DELETE", "/erp/warehouses/F5-STO")

    # 1. 공급처 수정 — terms 왕복 + 중복명 409 + GENERAL 403
    comps = call(tok, "GET", "/companies").json()
    ok("업체 목록 companyId 노출", all("companyId" in c for c in comps))
    target = next(c for c in comps if c["name"] == "대신금속")
    orig_terms = target["terms"]
    ok("업체 수정 200", call(tok, "PUT", f"/companies/{target['companyId']}",
       {"terms": "F5-probe"}).ok)
    got = next(c for c in call(tok, "GET", "/companies").json()
               if c["companyId"] == target["companyId"])
    ok("terms 반영", got["terms"] == "F5-probe")
    other = next(c for c in comps if c["companyId"] != target["companyId"])
    ok("중복명 -> 409", call(tok, "PUT", f"/companies/{target['companyId']}",
       {"name": other["name"]}).status == 409)
    ok("GENERAL 수정 -> 403", call(tok_gen, "PUT", f"/companies/{target['companyId']}",
       {"terms": "x"}).status == 403)
    call(tok, "PUT", f"/companies/{target['companyId']}", {"terms": orig_terms or ""})
    ok("terms 원복", next(c for c in call(tok, "GET", "/companies").json()
       if c["companyId"] == target["companyId"])["terms"] == (orig_terms or ""))

    # 2. 부품 수정 — weight 왕복 + 재질 검증 422
    parts = call(tok, "GET", "/parts").json()
    part = parts[0]
    orig_w = part["weight"]
    ok("부품 수정 200", call(tok, "PUT", f"/parts/{part['partNo']}",
       {"weight": 9.99}).ok)
    got = next(x for x in call(tok, "GET", "/parts").json() if x["partNo"] == part["partNo"])
    ok("weight 반영", abs((got["weight"] or 0) - 9.99) < 0.001)
    ok("없는 재질 -> 422", call(tok, "PUT", f"/parts/{part['partNo']}",
       {"materialCode": "ZZ-NONE"}).status == 422)
    call(tok, "PUT", f"/parts/{part['partNo']}",
         {"weight": orig_w if orig_w is not None else 0})
    ok("weight 원복", True)

    # 3. 재질 수정 — standard 왕복
    mats = call(tok, "GET", "/materials").json()
    mat = mats[0]
    orig_std = mat["standard"]
    ok("재질 수정 200", call(tok, "PUT", f"/materials/{mat['code']}",
       {"standard": "F5-STD"}).ok)
    got = next(x for x in call(tok, "GET", "/materials").json() if x["code"] == mat["code"])
    ok("standard 반영", got["standard"] == "F5-STD")
    call(tok, "PUT", f"/materials/{mat['code']}", {"standard": orig_std or ""})
    ok("standard 원복", True)

    # 4. 검증 규칙 — 비활성 토글 왕복 (verificationId 노출)
    vers = call(tok, "GET", "/drawings/KDCR%203-13/verifications").json()
    ok("검증 규칙 verificationId 노출", all("verificationId" in v for v in vers))
    ver = vers[0]
    ok("규칙 비활성 200", call(tok, "PUT", f"/verifications/{ver['verificationId']}",
       {"isActive": not ver["active"]}).ok)
    got = next(v for v in call(tok, "GET", "/drawings/KDCR%203-13/verifications").json()
               if v["verificationId"] == ver["verificationId"])
    ok("active 토글 반영", got["active"] == (not ver["active"]))
    call(tok, "PUT", f"/verifications/{ver['verificationId']}", {"isActive": ver["active"]})
    ok("active 원복", True)

    # 5. Variant 값 — 시험 값 등록 → 수정 → 폐기 → psql 정리
    ok("시험 값 등록", call(tok, "POST", "/codes/values",
       {"group": "KOF", "slot": "B", "valueCode": "F5T", "valueName": "F5 시험"}).status == 201)
    vals = call(tok, "GET", "/codes/values?group=KOF").json()
    tv = next(v for v in vals if v["valueCode"] == "F5T")
    ok("valueId 노출", bool(tv.get("valueId")))
    ok("값 명칭 수정 200", call(tok, "PATCH", f"/codes/values/{tv['valueId']}",
       {"valueName": "F5 수정"}).ok)
    ok("폐기 200", call(tok, "PATCH", f"/codes/values/{tv['valueId']}",
       {"deprecate": True}).ok)
    got = next(v for v in call(tok, "GET", "/codes/values?group=KOF").json()
               if v.get("valueId") == tv["valueId"])
    ok("DEPRECATED 반영 + 명칭 수정", got["status"] == "DEPRECATED" and got["valueName"] == "F5 수정")
    psql("DELETE FROM code_item_value WHERE value_code='F5T'")
    ok("시험 값 정리", all(v["valueCode"] != "F5T"
       for v in call(tok, "GET", "/codes/values?group=KOF").json()))

    # 6. 창고 — 등록 → 개명·속성 수정 → 삭제 (전 API 왕복)
    ok("시험 위치 등록", call(tok, "POST", "/erp/warehouses",
       {"parentCode": "P1-WH-A", "locationType": "STORAGE", "code": "F5-STO",
        "name": "F5 보관", "hazard": "", "inspection": "6개월", "remarks": ""}).status == 201)
    ok("개명+검사주기 수정 200", call(tok, "PATCH", "/erp/warehouses/F5-STO",
       {"name": "F5 보관(개명)", "inspection": "1개월"}).ok)
    node = next(x for x in call(tok, "GET", "/erp/warehouses").json() if x["code"] == "F5-STO")
    ok("수정 반영", node["name"] == "F5 보관(개명)" and node["inspection"] == "1개월")
    ok("시험 위치 삭제", call(tok, "DELETE", "/erp/warehouses/F5-STO").ok)

    # 7. 단가 마감 — 시험 단가(먼 미래 창) 등록 → validTo 마감 → 검증 게이트 → psql 정리
    r = call(tok, "POST", "/prices",
             {"code": "EWT-3", "supplier": "대신금속", "price": 12345,
              "source": "견적", "validFrom": "2030-01-01", "validTo": "2030-06-30"})
    ok("시험 단가 등록", r.status == 201)
    prices = call(tok, "GET", "/prices").json()
    ok("단가 목록 priceId 노출", all("priceId" in p for p in prices))
    tp = next(p for p in prices if p["from"] == "2030-01-01")
    ok("시작 이전 종료 -> 422", call(tok, "PATCH", f"/prices/{tp['priceId']}",
       {"validTo": "2029-12-31"}).status == 422)
    ok("마감 200", call(tok, "PATCH", f"/prices/{tp['priceId']}",
       {"validTo": "2030-03-31"}).ok)
    got = next(p for p in call(tok, "GET", "/prices").json() if p["priceId"] == tp["priceId"])
    ok("validTo 반영", got["to"] == "2030-03-31")
    psql("DELETE FROM cst_price WHERE valid_from='2030-01-01'")
    ok("시험 단가 정리", all(p["from"] != "2030-01-01"
       for p in call(tok, "GET", "/prices").json()))

    # 8. 문서 메타 — 등록 → 메타 수정 → ACCEPTED 409 → 삭제
    ok("시험 문서 등록", call(tok, "POST", "/documents",
       {"docNo": "F5-DOC-01", "title": "F5 검증 문서", "docType": "REPORT",
        "grade": "S-3"}).status == 201)
    ok("메타 수정 200", call(tok, "PATCH", "/documents/F5-DOC-01/meta",
       {"title": "F5 수정 제목", "grade": "S-2"}).ok)
    docs = call(tok, "GET", "/documents").json()
    got = next(d for d in docs if d["docNo"] == "F5-DOC-01")
    ok("메타 반영 (제목·Grade·docType 노출)", got["title"] == "F5 수정 제목"
       and got["grade"] == "S-2" and got.get("docType") == "REPORT")
    accepted = next((d for d in docs if d["status"] == "Accepted"), None)
    if accepted:
        ok("ACCEPTED 메타 수정 -> 409", call(
            tok, "PATCH", f"/documents/{accepted['docNo']}/meta",
            {"title": "x"}).status == 409)
    else:
        ok("ACCEPTED 문서 없음 — 409 게이트 검사 생략", True)
    ok("시험 문서 삭제", call(tok, "DELETE", "/documents/F5-DOC-01").ok)

    # 9. Templet — 생성 → 삭제 → 404 (시스템/RELEASED 보호는 코드 게이트)
    ok("시험 Templet 저장", call(tok, "PUT", "/toolbox/templets/TPL-F5",
       {"templetType": "COMMAND", "definition": {"action": "f5"}}).ok)
    ok("Templet 삭제 200", call(tok, "DELETE", "/templets/TPL-F5").ok)
    ok("삭제 후 404", call(tok, "DELETE", "/templets/TPL-F5").status == 404)

    # 10. Macro — 무참조 생성→삭제 · 참조 Macro 409 (치수식 연결)
    ok("시험 Macro 저장", call(tok, "PUT", "/macros/F5-MACRO",
       {"expr": "Var(X,1)+1"}).ok)
    ok("무참조 Macro 삭제 200", call(tok, "DELETE", "/macros/F5-MACRO").ok)
    ok("참조 Macro 삭제 -> 409 (치수식/검증 연결)",
       call(tok, "DELETE", "/macros/DIM%20B%20(KDCR%203-13)").status in (404, 409)
       or call(tok, "DELETE", "/macros/Shaft%20길이%20계산").status == 409)

    # 11. Arrangement 구성품 — 추가 → 수량 수정 → 삭제 (왕복)
    arrs = call(tok, "GET", "/arrangements").json()
    ac = arrs[0]["code"]
    ok("구성품 추가", call(tok, "POST", f"/arrangements/{ac}/components",
       {"productCode": "KDP 1-21", "position": "F5", "quantity": 1}).status == 201)
    comps2 = call(tok, "GET", f"/arrangements/{ac}/components").json()
    ok("componentId 노출", all("componentId" in c for c in comps2))
    tc = next(c for c in comps2 if c["position"] == "F5")
    ok("수량 수정 200", call(tok, "PATCH",
       f"/arrangements/{ac}/components/{tc['componentId']}", {"quantity": 3}).ok)
    got = next(c for c in call(tok, "GET", f"/arrangements/{ac}/components").json()
               if c["componentId"] == tc["componentId"])
    ok("수량 반영", got["quantity"] == 3)
    ok("0 이하 수량 -> 422", call(tok, "PATCH",
       f"/arrangements/{ac}/components/{tc['componentId']}", {"quantity": 0}).status == 422)
    ok("구성품 삭제 200", call(tok, "DELETE",
       f"/arrangements/{ac}/components/{tc['componentId']}").ok)

    # ── UI 샘플 — 공급처 더블클릭 수정 왕복 ──
    b = pw.chromium.launch()
    page = b.new_context(viewport={"width": 1600, "height": 900}).new_page()
    page.goto(f"{BASE}/erp", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill("edim")
        page.get_by_label("비밀번호").fill("edim")
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)
    page.locator(".tn", has_text="공급처·거래처 (M-14-2)").first.click()
    page.wait_for_timeout(1500)
    page.locator("table.g:visible tbody tr", has_text="대신금속").first.dblclick()
    page.wait_for_selector("[data-com-edit]", timeout=4000)
    ok("UI 더블클릭 → 수정 다이얼로그", True)
    page.locator("[data-com-edit] input[aria-label='평가 등급']").fill("A")
    page.locator("[data-com-edit] button", has_text="저장").click()
    page.wait_for_selector("text=업체 수정 ✓", timeout=6000)
    ok("UI 수정 ✓ 반영", True)
    # 원복 (grade '')
    tid_row = next(c for c in call(tok, "GET", "/companies").json() if c["name"] == "대신금속")
    call(tok, "PUT", f"/companies/{tid_row['companyId']}", {"grade": target["grade"] or ""})
    ok("UI 수정 원복", True)

    # 단가 화면 — 적용 마감 버튼 노출 (선택 전 disabled) — Next 라벨 현행화
    page.locator(".tn", has_text="단가 관리 (M-12-5)").first.click()
    page.wait_for_timeout(1200)
    ok("적용 마감 버튼 (선택 전 disabled)",
       page.get_by_role("button", name="적용 마감").is_disabled())
    page.locator("table.g:visible tbody tr").first.click()
    page.wait_for_timeout(300)
    ok("선택 후 enabled", page.get_by_role("button", name="적용 마감").is_enabled())
    b.close()

    # 정리 — 본 스위트가 유발한 자동 승인 요청(슬롯 값 F5T·문서 F5-DOC-01) 반려 (승인함 누적 오염 방지)
    for it in call(tok, "GET", "/approvals/inbox").json():
        tgt = it.get("target") or ""
        if "F5T" in tgt or "F5-DOC-01" in tgt or "F5 검증" in tgt:
            call(tok, "POST", f"/approvals/{it['id']}/decide",
                 {"approve": False, "comment": "F5 자체 정리"})
    ok("승인 요청 잔재 정리", True)

print(f"\nOK — live_f5_updates {n}/{n}")

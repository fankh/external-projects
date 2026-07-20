# -*- coding: utf-8 -*-
"""F1 라이브 — 프로젝트 도메인 실체화 (S-3-5): 대장·PS 채번·삭제 보호·접수자료 실업로드·타이틀바 컨텍스트.

API: 목록 → 등록(채번 증가) → 422/403 → 단계 전이 → 삭제 보호(단계·참조) → RECEIVED 업로드 왕복 → 시드 v18 실파일.
UI: 대장 그리드 · F2 등록 다이얼로그 → 타이틀바 컨텍스트 전환 확인.
실행: PYTHONUTF8=1 py tests/live_f1_project.py
정리: 스위트 자체 수행 (생성 프로젝트·업로드 파일 전부 삭제).
"""
import re

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

    # 0. 잔존 정리 (이전 실패 런)
    for p in call(tok, "GET", "/projects").json():
        if p["projectName"].startswith("F1 검증") or p["projectName"].startswith("F1 UI"):
            for f in call(tok, "GET", f"/files?project={p['projectNo']}").json():
                if f.get("fileId") and f["folder"] == "RECEIVED":
                    call(tok, "DELETE", f"/files/{f['fileId']}")
            call(tok, "PATCH", f"/projects/{p['projectNo']}", {"stage": "기술 제안"})
            call(tok, "DELETE", f"/projects/{p['projectNo']}")

    # 1. 목록 — 시드 3건 + Micron 고객 연결
    rows = call(tok, "GET", "/projects").json()
    ok("목록 >=3 (시드 PS-61313-5/612/598)", len(rows) >= 3)
    m7 = next((x for x in rows if x["projectNo"] == "PS-61313-5"), None)
    ok("PS-61313-5 — Micron #7 · client=Micron", m7 is not None
       and m7["projectName"] == "Micron #7" and m7["client"] == "Micron")
    ok("행 필드 (stage·registeredAt·status)", bool(m7["stage"]) and bool(m7["registeredAt"])
       and m7["status"] == "IN_PROGRESS")

    # 2. 등록 — PS 자동 채번 (연속 2건 = 증가)
    r = call(tok, "POST", "/projects",
             {"projectName": "F1 검증 프로젝트", "projectType": "Client", "item": "Fan",
              "client": "F1테스트고객", "clientContact": "QA"})
    ok("등록 201", r.status == 201)
    p1 = r.json()
    ok("PS-<seq> 채번", re.fullmatch(r"PS-\d+", p1["projectNo"]) is not None)
    ok("기본 단계 = 기술 제안", p1["stage"] == "기술 제안")
    p2 = call(tok, "POST", "/projects",
              {"projectName": "F1 검증 프로젝트 2", "projectType": "R&D", "item": "AHU",
               "client": "", "clientContact": ""}).json()
    ok("채번 증가", int(p2["projectNo"][3:]) > int(p1["projectNo"][3:]))
    rows = call(tok, "GET", "/projects").json()
    got = next((x for x in rows if x["projectNo"] == p1["projectNo"]), None)
    ok("목록 반영 + item/client 보존", got is not None and got["item"] == "Fan"
       and got["client"] == "F1테스트고객")

    # 3. 검증·권한
    ok("빈 이름 -> 422", call(tok, "POST", "/projects",
                          {"projectName": "  ", "projectType": "Client"}).status == 422)
    ok("알 수 없는 Type -> 422", call(tok, "POST", "/projects",
                                 {"projectName": "x", "projectType": "X"}).status == 422)
    ok("GENERAL 등록 -> 403", call(tok_gen, "POST", "/projects",
                               {"projectName": "x", "projectType": "Client"}).status == 403)
    ok("GENERAL 삭제 -> 403",
       call(tok_gen, "DELETE", f"/projects/{p1['projectNo']}").status == 403)

    # 4. 삭제 보호 — 단계
    call(tok, "PATCH", f"/projects/{p1['projectNo']}", {"stage": "견적"})
    ok("견적 단계 삭제 -> 409",
       call(tok, "DELETE", f"/projects/{p1['projectNo']}").status == 409)
    call(tok, "PATCH", f"/projects/{p1['projectNo']}", {"stage": "기술 제안"})

    # 5. 접수 자료 실업로드 (RECEIVED) — 등록자·폴더·왕복
    r = req.post(f"{API}/files/upload",
                 headers={"Authorization": f"Bearer {tok}"},
                 multipart={
                     "uploadedFile": {"name": "F1_접수검증.txt", "mimeType": "text/plain",
                                      "buffer": "F1 received-file probe".encode()},
                     "folder": "RECEIVED", "project": p1["projectNo"],
                 })
    ok("RECEIVED 업로드 201", r.status == 201)
    fid = r.json()["fileId"]
    files = call(tok, "GET", f"/files?project={p1['projectNo']}").json()
    mine = next((x for x in files if x.get("fileId") == fid), None)
    ok("파일 목록 — 접수자료·등록자 edim", mine is not None and mine["folder"] == "RECEIVED"
       and mine["kind"] == "접수자료" and mine["registrant"] == "edim")
    body = req.get(f"{API}/files/download/{fid}",
                   headers={"Authorization": f"Bearer {tok}"}).body()
    ok("바이트 왕복", body == b"F1 received-file probe")

    # 6. 삭제 보호 — 참조(파일) → 정리 후 삭제
    ok("파일 참조 삭제 -> 409",
       call(tok, "DELETE", f"/projects/{p1['projectNo']}").status == 409)
    ok("파일 삭제", call(tok, "DELETE", f"/files/{fid}").status == 200)
    ok("프로젝트 삭제 (기술 제안·무참조)",
       call(tok, "DELETE", f"/projects/{p1['projectNo']}").status == 200)
    ok("삭제 후 404", call(tok, "GET", f"/projects/{p1['projectNo']}").status == 404)
    ok("p2 정리", call(tok, "DELETE", f"/projects/{p2['projectNo']}").status == 200)

    # 7. 시드 v18 — mock 이던 접수자료 2건이 실파일 (fileId + 다운로드)
    files = call(tok, "GET", "/files?project=PS-61313-5").json()
    spec = next((x for x in files if x["name"] == "Micron7_사양서_v2.xlsx"), None)
    ok("시드 접수자료 — 실 fileId", spec is not None and spec.get("fileId"))
    body = req.get(f"{API}/files/download/{spec['fileId']}",
                   headers={"Authorization": f"Bearer {tok}"}).body()
    ok("시드 XLSX 실바이트 (PK 시그니처)", body[:2] == b"PK")
    layout = next((x for x in files if x["name"] == "현장 배치도.pdf"), None)
    ok("시드 PDF 실파일", layout is not None and layout.get("fileId"))

    # ── UI — 대장·F2 등록·타이틀바 컨텍스트 ──
    b = pw.chromium.launch()
    page = b.new_context(viewport={"width": 1600, "height": 900}).new_page()
    page.goto(f"{BASE}/erp", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill("edim")
        page.get_by_label("비밀번호").fill("edim")
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)
    tree_click(page, "Project 등록 (S-3-5)")
    page.wait_for_timeout(1500)
    ok("UI 대장 행 >=3", page.locator("table.g:visible tbody tr").count() >= 3)
    ok("UI 타이틀바 프로젝트 컨텍스트", "(PS-" in page.locator(".titlebar").inner_text())

    # Next — RegisterModal(data-modal): 프로젝트명+고객사 필수, ok 문구 'PS-… 등록'
    page.get_by_role("button", name="＋ 프로젝트 등록").click()
    page.wait_for_selector("[data-modal]", timeout=3000)
    dlg = page.locator("[data-modal]")
    dlg.locator("input[name=projectName]").fill("F1 UI 프로젝트")
    dlg.locator("input[name=client]").fill("F1 검증 고객")
    dlg.locator("button[type=submit]").click()
    page.wait_for_timeout(1500)
    created = [p2 for p2 in call(tok, "GET", "/projects").json()
               if p2["projectName"] == "F1 UI 프로젝트"]
    ok("UI 등록 ✓ + PS 채번", len(created) == 1
       and re.match(r"PS-\d+", created[0]["projectNo"]) is not None)
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)
    ok("UI 목록 반영", page.locator("table.g:visible tbody tr", has_text="F1 UI 프로젝트").count() >= 1)

    # 행 클릭 = 타이틀바 프로젝트 컨텍스트 (edim-set-project)
    page.locator("table.g:visible tbody tr", has_text="PS-61313-5").first.click()
    page.wait_for_timeout(600)
    ok("UI 컨텍스트 복귀 (Micron #7)", "Micron #7" in page.locator(".titlebar").inner_text())
    b.close()

    # UI 생성분 정리 (기술 제안·무참조 → 삭제 가능)
    ok("UI 프로젝트 정리", call(
        tok, "DELETE", f"/projects/{created[0]['projectNo']}").status == 200)

print(f"\nOK — live_f1_project {n}/{n}")

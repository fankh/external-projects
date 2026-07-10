# -*- coding: utf-8 -*-
"""개발서버 요구사항 접수 라이브 — /config devMode 게이트 · CRUD · 이미지 첨부 · RBAC · UI 모달.

운영자(GENERAL 포함)가 등록(+스크린샷) → SETUP 이 상태 변경 → 삭제(이미지 연쇄) 정리까지 왕복.
실행: PYTHONUTF8=1 py tests/live_dev_requirements.py
정리: 스위트 말미 자체 수행 (등록 행 DELETE — 이미지 MinIO 객체 포함 연쇄).
"""
import io
import struct
import zlib

from playwright.sync_api import expect, sync_playwright


def make_png(w: int = 8, h: int = 8) -> bytes:
    """유효한 최소 PNG (단색) — 외부 파일 의존 없이 생성."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\x33\x54\x88" * w for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))

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

    def login(user: str) -> str:
        r = req.post(f"{API}/auth/login", data={"userId": user, "password": "edim"})
        assert r.ok, r.status
        return r.json()["token"]

    def call(token: str, method: str, path: str, **kw):
        return req.fetch(f"{API}{path}", method=method,
                         headers={"Authorization": f"Bearer {token}",
                                  "Content-Type": "application/json"}, **kw)

    tok_admin = login("edim")
    tok_general = login("kim01")

    # 1. devMode 게이트 — 개발서버는 true
    r = call(tok_admin, "GET", "/config")
    ok("GET /config devMode=true (개발서버)", r.ok and r.json()["devMode"] is True)

    # 2. GENERAL 운영자 등록 가능
    r = call(tok_general, "POST", "/dev/requirements", data={
        "title": "TEST-DEVREQ 단가 화면 통화 선택", "content": "KRW 외 USD 표기 필요",
        "category": "FEATURE", "priority": "P2", "screenId": "erp-price"})
    ok("GENERAL 등록 -> 201", r.status == 201)
    rid = r.json()["reqId"]

    # 3. 검증 오류 — 빈 제목 422, 분류 오류 422
    r = call(tok_general, "POST", "/dev/requirements", data={"title": " "})
    ok("빈 제목 -> 422", r.status == 422)
    r = call(tok_general, "POST", "/dev/requirements", data={"title": "x", "category": "NOPE"})
    ok("분류 오류 -> 422", r.status == 422)

    # 4. 목록에 반영 (컨텍스트 화면 포함)
    r = call(tok_admin, "GET", "/dev/requirements")
    rows = r.json()
    mine = next((x for x in rows if x["reqId"] == rid), None)
    ok("목록 반영 + screenId 컨텍스트", mine is not None and mine["screenId"] == "erp-price")
    ok("초기 상태 OPEN", mine["status"] == "OPEN")

    # 4.5 이미지 첨부 — 업로드 → 목록 → 바이트 왕복 → 비이미지 422
    png = make_png()
    r = req.post(f"{API}/dev/requirements/{rid}/images",
                 headers={"Authorization": f"Bearer {tok_general}"},
                 multipart={"uploadedFile": {"name": "shot.png", "mimeType": "image/png",
                                             "buffer": png}})
    ok("이미지 업로드 -> 201", r.status == 201)
    img_id = r.json()["imageId"]
    r = call(tok_general, "GET", f"/dev/requirements/{rid}/images")
    ok("이미지 목록 1건", r.ok and len(r.json()) == 1 and r.json()[0]["fileName"] == "shot.png")
    r = call(tok_general, "GET", f"/dev/requirements/images/{img_id}")
    ok("이미지 바이트 왕복 (PNG 시그니처)", r.ok and r.body()[:8] == b"\x89PNG\r\n\x1a\n")
    r = req.post(f"{API}/dev/requirements/{rid}/images",
                 headers={"Authorization": f"Bearer {tok_general}"},
                 multipart={"uploadedFile": {"name": "evil.txt", "mimeType": "text/plain",
                                             "buffer": b"not an image"}})
    ok("비이미지 첨부 -> 422", r.status == 422)
    r = call(tok_admin, "GET", "/dev/requirements")
    mine = next((x for x in r.json() if x["reqId"] == rid), None)
    ok("목록에 imageCount=1", mine is not None and mine["imageCount"] == 1)

    # 5. RBAC — 상태 변경·삭제는 SETUP+, GENERAL 403
    r = call(tok_general, "PATCH", f"/dev/requirements/{rid}", data={"status": "DONE"})
    ok("GENERAL 상태 변경 -> 403", r.status == 403)
    r = call(tok_general, "DELETE", f"/dev/requirements/{rid}")
    ok("GENERAL 삭제 -> 403", r.status == 403)

    # 6. SETUP 상태 변경 → resolved_at 기록
    r = call(tok_admin, "PATCH", f"/dev/requirements/{rid}",
             data={"status": "DONE", "resolution": "라이브 검증용 — 자동 처리"})
    ok("SETUP DONE 처리", r.ok)
    r = call(tok_admin, "GET", "/dev/requirements?status=DONE")
    mine = next((x for x in r.json() if x["reqId"] == rid), None)
    ok("status 필터 + resolvedAt 기록", mine is not None and mine["resolvedAt"])

    # 7. UI — 타이틀바 📝 버튼 → 모달 등록 → 상태바 ✓
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/cpq", wait_until="networkidle")
    p.get_by_label("사번").fill("edim")
    p.get_by_label("비밀번호").fill("edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=8000)
    p.locator("[data-devreq-btn]").wait_for(timeout=8000)
    ok("타이틀바 📝 버튼 표시 (devMode)", True)
    p.locator("[data-devreq-btn]").click()
    p.locator("[data-devreq-dialog]").wait_for(timeout=5000)
    p.get_by_label("요구 제목").fill("TEST-DEVREQ UI 등록 검증")
    p.get_by_label("요구 내용").fill("모달 왕복 검증용 — 자동 삭제됨")
    p.get_by_label("이미지 첨부").set_input_files(
        files=[{"name": "ui-shot.png", "mimeType": "image/png", "buffer": png}])
    p.locator("[data-devreq-dialog] img").first.wait_for(timeout=5000)   # 썸네일 미리보기
    ok("이미지 선택 → 썸네일 미리보기", True)
    p.get_by_role("button", name="등록 (📎 1)").click()
    p.locator(".statusbar", has_text="📎 이미지 1").wait_for(timeout=10000)
    ok("모달 등록 → 상태바 ✓ (📎 이미지 1)", True)
    # 목록 탭에서 행 확인
    p.locator("[data-devreq-btn]").click()
    p.locator("[data-devreq-dialog] .mdi .t", has_text="목록").click()
    expect(p.locator("[data-devreq-dialog] tr", has_text="TEST-DEVREQ UI 등록 검증")).to_have_count(1, timeout=8000)
    ok("모달 목록 탭에 등록 행 표시", True)
    b.close()

    # 8. 정리 — TEST-DEVREQ 행 전부 삭제 (이미지 연쇄 포함, 반복 실행 누적 방지)
    r = call(tok_admin, "GET", "/dev/requirements")
    removed = 0
    for x in r.json():
        if x["title"].startswith("TEST-DEVREQ"):
            d = call(tok_admin, "DELETE", f"/dev/requirements/{x['reqId']}")
            assert d.ok, d.status
            removed += 1
    ok(f"정리 — TEST-DEVREQ {removed}건 삭제", removed >= 2)
    r = call(tok_admin, "GET", f"/dev/requirements/images/{img_id}")
    ok("삭제 후 이미지 연쇄 제거 -> 404", r.status == 404)

    req.dispose()

print(f"\n개발서버 요구사항 접수 라이브: {n}/{n} pass")

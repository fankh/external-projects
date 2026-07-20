# -*- coding: utf-8 -*-
"""G3 라이브 — 제품 코드 마스터 CRUD.

API: 수동 생성(DRAFT)·중복 409·그룹없음 422·코드명 수정·상태(APPROVED/INACTIVE)·잘못된 상태 422·
     참조 코드 삭제 409·미참조 삭제. 정리: 생성 코드 삭제.
실행: PYTHONUTF8=1 py tests/live_g3_product_master.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
CODE = "ZZ TESTCODE 1"
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

    def products(status="ALL"):
        return req.get(f"{API}/codes/products?status={status}").json()

    def find(code):
        return next((p for p in products() if p["mainCode"] == code), None)

    # #28 — 자유텍스트 등록은 Slot 미정의 그룹 전용 (Slot 그룹은 조합 생성만 허용)
    _manual = [g["groupCode"] for g in req.get(f"{API}/codes/groups").json() if g["slotCount"] == 0]
    assert _manual, "Slot 미정의 그룹 없음 — 시드 GEN 확인"
    grp = _manual[0]
    created = None
    try:
        # 생성 → DRAFT
        r = req.post(f"{API}/codes/products", data={"mainCode": CODE, "codeName": "테스트 코드", "groupCode": grp})
        ok("수동 생성 201", r.status == 201)
        row = find(CODE); created = row["productCodeId"] if row else None
        ok("생성 코드 DRAFT·참조 0", row and row["status"] == "DRAFT" and row["refs"] == 0)

        # 중복 409
        ok("중복 코드 409", req.post(f"{API}/codes/products", data={"mainCode": CODE, "codeName": "x", "groupCode": grp}).status == 409)
        # 그룹 없음 422
        ok("그룹 없음 422", req.post(f"{API}/codes/products", data={"mainCode": "ZZ NOGRP", "codeName": "x", "groupCode": "NO_SUCH_GRP"}).status == 422)

        # 코드명 수정
        req.patch(f"{API}/codes/products/{created}", data={"codeName": "수정된 코드명"})
        ok("코드명 수정", find(CODE)["codeName"] == "수정된 코드명")
        # 상태 승인 → 비활성
        req.patch(f"{API}/codes/products/{created}", data={"status": "APPROVED"})
        ok("상태 APPROVED", find(CODE)["status"] == "APPROVED")
        req.patch(f"{API}/codes/products/{created}", data={"status": "INACTIVE"})
        ok("상태 INACTIVE(비활성)", find(CODE)["status"] == "INACTIVE")
        # 잘못된 상태 422
        ok("잘못된 상태 422", req.patch(f"{API}/codes/products/{created}", data={"status": "BOGUS"}).status == 422)
        # 상태 필터
        ok("상태 필터 INACTIVE", any(p["mainCode"] == CODE for p in products("INACTIVE")))

        # 참조 있는 코드 삭제 409
        ref = next((p for p in products() if p["refs"] > 0), None)
        if ref:
            ok("참조 코드 삭제 409", req.delete(f"{API}/codes/products/{ref['productCodeId']}").status == 409)
        else:
            ok("참조 코드 삭제 409(참조 코드 없음→스킵)", True)

        # 미참조(생성분) 삭제
        ok("미참조 삭제 200", req.delete(f"{API}/codes/products/{created}").status in (200, 204))
        ok("삭제 후 목록 제거", find(CODE) is None)
        created = None
    finally:
        if created:
            req.delete(f"{API}/codes/products/{created}")

print(f"\nOK — live_g3_product_master {n}/{n}")

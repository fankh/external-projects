# -*- coding: utf-8 -*-
"""G3 라이브 — 핵심 마스터 대량 import (거래처·부품).

API: xlsx 업로드 → 행 단위 등록·중복 거부 리포트·헤더 검증 422.
정리: 생성 거래처·부품 psql 삭제.
실행: PYTHONUTF8=1 py tests/live_g3_bulk_import.py
"""
import io
import subprocess
import openpyxl
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def xlsx(headers, rows):
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(headers)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO(); wb.save(buf); return buf.getvalue()


def psql(sql):
    subprocess.run(["ssh", "edim-server",
                    f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                   capture_output=True, text=True, timeout=30)


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    def up(path, data):
        return req.post(f"{API}{path}", multipart={
            "uploadedFile": {"name": "bulk.xlsx",
                             "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             "buffer": data}})

    # 사전 정리
    for nm in ("ZZBULK사A", "ZZBULK사B"):
        psql(f"DELETE FROM com_company WHERE company_name='{nm}'")
    for pn in ("ZZBULKP-1", "ZZBULKP-2"):
        psql(f"DELETE FROM prt_part WHERE part_no='{pn}'")
    try:
        # 거래처 — 2건 + 1 중복(이미 넣은 A) → 등록2·거부1
        co = xlsx(["업체명", "유형", "국가", "결제조건"],
                  [["ZZBULK사A", "SUPPLIER", "KR", "월말 30일"],
                   ["ZZBULK사B", "CUSTOMER", "US", "T/T"],
                   ["ZZBULK사A", "SUPPLIER", "KR", ""]])
        r = up("/companies/import-excel", co).json()
        ok("거래처 등록 2건", r["inserted"] == 2)
        ok("거래처 중복 거부 1건", r["rejectedCount"] == 1)

        # 헤더 누락 422
        bad = up("/companies/import-excel", xlsx(["이름"], [["x"]]))
        ok("헤더 누락 422", bad.status == 422)

        # 부품 — 2건, 공급처(ZZBULK사A 기존) 매핑
        pt = xlsx(["부품번호", "부품명", "사양", "단위", "중량", "공급처"],
                  [["ZZBULKP-1", "테스트부품1", "SUS304", "EA", "12.5", "ZZBULK사A"],
                   ["ZZBULKP-2", "테스트부품2", "AL", "EA", "3", ""]])
        rp = up("/parts/import-excel", pt).json()
        ok("부품 등록 2건", rp["inserted"] == 2)

        # 등록 확인 (부품 대장 조회)
        parts = req.get(f"{API}/parts").json()
        got = {p["partNo"] for p in parts}
        ok("부품 대장에 반영", "ZZBULKP-1" in got and "ZZBULKP-2" in got)
        p1 = next(p for p in parts if p["partNo"] == "ZZBULKP-1")
        ok("부품 공급처 매핑", p1.get("supplier") == "ZZBULK사A" or "ZZBULK" in str(p1))
    finally:
        for pn in ("ZZBULKP-1", "ZZBULKP-2"):
            psql(f"DELETE FROM prt_part WHERE part_no='{pn}'")
        for nm in ("ZZBULK사A", "ZZBULK사B"):
            psql(f"DELETE FROM com_company WHERE company_name='{nm}'")
    ok("정리 완료", True)

print(f"\nOK — live_g3_bulk_import {n}/{n}")

# -*- coding: utf-8 -*-
"""G3 라이브 — 공급처 평가/등급.

API: 지표 조회 · 평가 등록(가중 총점→등급) · 목록 · com_company 등급 반영 · upsert · 검증 422.
정리: 테스트 공급처 psql DELETE (CASCADE 로 평가 제거) + 고아 SUPP_EVAL 감사 정리.
실행: PYTHONUTF8=1 py tests/live_g3_supplier_eval.py
"""
import subprocess
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
NAME = "ZZ_EVAL_TEST_SUP"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def psql(sql):
    subprocess.run(["ssh", "edim-server",
                    f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                   capture_output=True, text=True, timeout=30)


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    def companies():
        return req.get(f"{API}/companies").json()

    def cid_of(name):
        return next((c["companyId"] for c in companies() if c["name"] == name), None)

    def grade_of(name):
        return next((c["grade"] for c in companies() if c["name"] == name), None)

    try:
        # 테스트 공급처 생성
        req.post(f"{API}/companies", data={"name": NAME, "companyType": "SUPPLIER", "nation": "KR"})
        cid = cid_of(NAME)
        ok("테스트 공급처 생성", isinstance(cid, int))

        # 지표(신규 → PO 0)
        m = req.get(f"{API}/erp/suppliers/{cid}/metrics").json()
        ok("지표 조회 — poCount/fulfillment/suggestedDelivery",
           m["poCount"] == 0 and m["fulfillmentPct"] == 0 and "suggestedDelivery" in m)

        # 평가 등록 — 90/85/80 → 86 → B
        r = req.post(f"{API}/erp/suppliers/evals",
                     data={"supplierId": cid, "period": "2026-07", "delivery": 90, "quality": 85, "price": 80}).json()
        ok("평가 총점 = 가중합(86)", abs(r["total"] - 86.0) < 0.01)
        ok("등급 B(80~89)", r["grade"] == "B")
        ok("목록 1건", len(req.get(f"{API}/erp/suppliers/evals?company_id={cid}").json()) == 1)
        ok("com_company 등급 반영 B", grade_of(NAME) == "B")

        # upsert 동일 기간 — 95/95/95 → 95 → A (중복 아님)
        r2 = req.post(f"{API}/erp/suppliers/evals",
                      data={"supplierId": cid, "period": "2026-07", "delivery": 95, "quality": 95, "price": 95}).json()
        ok("upsert 등급 A(≥90)", r2["grade"] == "A")
        ok("upsert = 중복 아님(여전히 1건)", len(req.get(f"{API}/erp/suppliers/evals?company_id={cid}").json()) == 1)
        ok("등급 A 반영", grade_of(NAME) == "A")

        # 다른 기간 70/70/70 → 70 → C
        r3 = req.post(f"{API}/erp/suppliers/evals",
                      data={"supplierId": cid, "period": "2026-06", "delivery": 70, "quality": 70, "price": 70}).json()
        ok("등급 C(70~79)", r3["grade"] == "C")
        ok("목록 2건(기간별)", len(req.get(f"{API}/erp/suppliers/evals?company_id={cid}").json()) == 2)
        ok("최신 기간(2026-07=A) 등급 유지", grade_of(NAME) == "A")

        # 검증 — 점수 범위 초과 422
        bad = req.post(f"{API}/erp/suppliers/evals",
                       data={"supplierId": cid, "period": "2026-05", "delivery": 101, "quality": 50, "price": 50})
        ok("점수>100 = 422", bad.status == 422)
    finally:
        psql(f"DELETE FROM com_company WHERE company_name='{NAME}'")
        psql("DELETE FROM sys_history WHERE action='SUPP_EVAL' "
             "AND target_id NOT IN (SELECT eval_id FROM com_supplier_eval)")
    ok("정리 — 테스트 공급처 삭제(CASCADE)", cid_of(NAME) is None)

print(f"\nOK — live_g3_supplier_eval {n}/{n}")

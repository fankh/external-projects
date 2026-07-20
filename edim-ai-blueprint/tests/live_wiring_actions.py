# -*- coding: utf-8 -*-
"""미배선 API 배선 라이브 (뮤테이션) — v34.39~42 배선분 왕복 검증.

견적/견적안 삭제 · 관계 DRAFT 회수 · 사용자 초대 · 제품코드/거래처 batch · 도면 BOM 편집.
실행: PYTHONUTF8=1 py tests/live_wiring_actions.py
정리: 생성물은 UI 삭제 자체가 정리 경로, 거래처는 psql, 초대 알림은 read 처리.
"""
import json
import os
import subprocess
import urllib.request
from urllib.parse import quote

BASE = os.getenv("BASE", "https://edim.seekerslab.com/").rstrip("/")
API = f"{BASE}/api/v1"
DWG = "KDCR 3-13"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def psql(sql):
    subprocess.run(["ssh", "edim-server",
                    f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                   capture_output=True, text=True, timeout=40)


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + quote(path, safe="/?=&%"), data=data, headers=H, method=method)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read() or b"null")


r0 = urllib.request.Request(f"{API}/auth/login",
    data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
    headers={"Content-Type": "application/json"}, method="POST")
TOK = json.loads(urllib.request.urlopen(r0).read())["token"]
H = {"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"}

# 사전 정리 (이전 실패 잔재)
psql("DELETE FROM com_company WHERE company_name LIKE 'BATCH-T%'")
psql("DELETE FROM product_code WHERE main_code LIKE 'KDW-BT%'")

# 준비
q = req("POST", "/cost/quotations", {"businessType": "PRE_SALES"})
qno = q["quotationNo"]
qid = next(x["quotationId"] for x in req("GET", "/cost/quotations") if x["quotationNo"] == qno)
sel = req("POST", "/cpq/selections", {"projectNo": "PS-61313-5", "rootCode": DWG,
                                       "finishedGoodsCode": "KDCR 3-13-13-15", "slotValues": {"B": "13", "C": "32", "E": "15"}})
sel_id = sel["selectionId"]
grp = req("GET", "/codes/products")[0]["groupCode"]
for c in ("KDW-BT1", "KDW-BT2"):
    req("POST", "/codes/products", {"mainCode": c, "codeName": f"배치검증 {c}", "groupCode": grp})
for nm in ("BATCH-T1", "BATCH-T2"):
    req("POST", "/companies", {"name": nm, "companyType": "SUPPLIER", "nation": "KR", "grade": "", "terms": ""})
children = req("GET", f"/codes/relationships/{DWG}/children")
rel_cands = [p["mainCode"] for p in req("GET", "/codes/products")
             if p["mainCode"] != DWG and p["mainCode"] not in {c["code"] for c in children}
             and not p["mainCode"].startswith("KDW-BT")][:6]
bom0 = req("GET", f"/drawings/{DWG}/bom")
in_bom = {b["partNo"] for b in bom0}
bom_cand = next((p["partNo"] for p in req("GET", "/parts") if p["partNo"] not in in_bom), None)
bom_probe = False
if bom_cand is None:
    # 전 부품이 이미 BOM 에 있으면 프로브 부품 생성 (tail 에서 삭제)
    bom_cand = "BOMT-PROBE-01"
    req("POST", "/parts", {"partNo": bom_cand, "name": "BOM 배선 프로브", "specification": "",
                            "materialCode": "", "supplier": "", "productCode": "", "unit": "EA",
                            "weight": None, "isStandard": False})
    bom_probe = True
d0 = req("GET", "/notifications/digest")["unread"]

from playwright.sync_api import sync_playwright  # noqa: E402

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        p = b.new_page(viewport={"width": 1600, "height": 900})
        p.on("dialog", lambda d: d.accept())
        p.goto(f"{BASE}/login", wait_until="networkidle")
        p.fill("input[name=userId]", "edim")
        p.fill("input[name=password]", "edim")
        p.get_by_role("button", name="로그인 (Enter)").click()
        p.wait_for_url("**/erp/**", timeout=15000)

        # 1) 견적 삭제 (D-1, DRAFT 한정)
        p.goto(f"{BASE}/erp/sales-order", wait_until="networkidle")
        p.wait_for_timeout(800)
        p.locator("table.g:visible tbody tr", has_text=qno).first.click()
        p.wait_for_timeout(300)
        p.locator("[data-quote-del]").click()
        p.locator(f"text=견적 #{qid} 삭제 ✓").wait_for(timeout=10000)
        ok("견적 삭제 (DRAFT)", all(x["quotationId"] != qid for x in req("GET", "/cost/quotations")))

        # 2) 견적안 삭제 (C-1, Run 미참조)
        p.goto(f"{BASE}/cpq/selection", wait_until="networkidle")
        p.wait_for_timeout(800)
        p.select_option("select[aria-label*='견적안']", str(sel_id))
        p.wait_for_timeout(600)
        p.locator("[data-sel-del]").click()
        p.locator(f"text=견적안 #{sel_id} 삭제 ✓").wait_for(timeout=10000)
        ok("견적안 삭제", all(s["selectionId"] != sel_id for s in req("GET", "/cpq/selections?projectNo=PS-61313-5")))

        # 3) 관계 DRAFT 추가 → ✕ 회수 (S-1-4)
        p.goto(f"{BASE}/code/relationship", wait_until="networkidle")
        p.wait_for_timeout(800)
        added = False
        for cand in rel_cands:
            p.locator("input[aria-label='Child Code']").fill(cand)
            p.locator("button", has_text="＋ Add").click()
            try:
                p.locator("text=Child 추가 ✓").wait_for(timeout=5000)
                added = True
                break
            except Exception:  # noqa: BLE001
                continue
        ok("관계 DRAFT 추가", added and p.locator("[data-rel-drafts]").count() == 1)
        p.locator("[data-rel-draft-del]").first.click()
        p.locator("text=삭제 ✓ (승인 전 회수)").wait_for(timeout=10000)
        ok("관계 DRAFT ✕ 회수", p.locator("[data-rel-drafts]").count() == 0)

        # 4) 사용자 초대 (M-14-6)
        p.goto(f"{BASE}/erp/roles", wait_until="networkidle")
        p.wait_for_timeout(800)
        p.locator("table.g:visible tbody tr", has_text="edim").first.click()
        p.wait_for_timeout(300)
        p.locator("[data-user-invite]").click()
        p.locator("text=초대 발송 ✓").wait_for(timeout=10000)
        ok("초대 발송 (+1 알림)", req("GET", "/notifications/digest")["unread"] == d0 + 1)

        # 5) 제품코드 batch — 전이 → 삭제(정리)
        p.goto(f"{BASE}/code/product-codes", wait_until="networkidle")
        p.wait_for_timeout(800)
        for c in ("KDW-BT1", "KDW-BT2"):
            p.locator("table.g:visible tbody tr", has_text=c).first.locator("input[type=checkbox]").first.check()
            p.wait_for_timeout(200)
        p.locator("[data-pc-batch-status]").click()
        p.locator("text=일괄 상태→INACTIVE ✓ — 2/2건").wait_for(timeout=10000)
        ok("제품코드 일괄 전이", True)
        for c in ("KDW-BT1", "KDW-BT2"):
            p.locator("table.g:visible tbody tr", has_text=c).first.locator("input[type=checkbox]").first.check()
            p.wait_for_timeout(200)
        p.locator("[data-pc-batch-del]").click()
        p.locator("text=일괄 삭제 ✓ — 2/2건").wait_for(timeout=10000)
        ok("제품코드 일괄 삭제", all(not x["mainCode"].startswith("KDW-BT") for x in req("GET", "/codes/products")))

        # 6) 거래처 batch 비활성
        p.goto(f"{BASE}/erp/companies", wait_until="networkidle")
        p.wait_for_timeout(800)
        for nm in ("BATCH-T1", "BATCH-T2"):
            p.locator("table.g:visible tbody tr", has_text=nm).first.locator("input[type=checkbox]").first.check()
            p.wait_for_timeout(200)
        p.locator("[data-com-batch-off]").click()
        p.locator("text=일괄 비활성 ✓ — 2/2건").wait_for(timeout=10000)
        tgt = [x for x in req("GET", "/companies") if x["name"].startswith("BATCH-T")]
        ok("거래처 일괄 비활성", len(tgt) == 2 and all(x.get("isActive") is False for x in tgt))

        # 7) 도면 BOM 추가 → 중복 409 → 삭제(원복)
        p.goto(f"{BASE}/detail/part?drawing={quote(DWG)}&block=brgL", wait_until="networkidle")
        p.wait_for_timeout(800)
        ed = p.locator("[data-bom-editor]")
        ed.locator("input[aria-label='BOM 부품번호']").fill(bom_cand)
        ed.locator("input[aria-label='BOM 수량']").fill("2")
        p.locator("[data-bom-add]").click()
        p.locator("text=BOM 추가 ✓").wait_for(timeout=10000)
        ok("BOM 라인 추가", any(x["partNo"] == bom_cand for x in req("GET", f"/drawings/{DWG}/bom")))
        ed.locator("input[aria-label='BOM 부품번호']").fill(bom_cand)
        p.locator("[data-bom-add]").click()
        p.locator("text=이미 BOM").wait_for(timeout=8000)
        p.wait_for_timeout(600)
        p.locator("[data-bom-editor] tbody tr", has_text=bom_cand).first.locator("[data-bom-del]").click()
        p.locator("text=삭제 ✓").wait_for(timeout=10000)
        bom2 = req("GET", f"/drawings/{DWG}/bom")
        ok("BOM 중복 409 + 삭제 원복", all(x["partNo"] != bom_cand for x in bom2) and len(bom2) == len(bom0))
        b.close()
finally:
    # 정리 — 초대 알림 read·잔재 psql·BOM 라인/프로브 부품 회수
    for x in req("GET", "/notifications"):
        if "EDIM 초대" in x.get("title", "") and not x.get("read"):
            req("POST", f"/notifications/{x['id']}/read")
    for b2 in req("GET", f"/drawings/{DWG}/bom"):
        if b2["partNo"] == bom_cand:
            req("DELETE", f"/drawings/{DWG}/bom/{b2['bomId']}")
    if bom_probe:
        try:
            req("DELETE", f"/parts/{bom_cand}")
        except Exception:  # noqa: BLE001
            psql(f"DELETE FROM prt_part WHERE part_no='{bom_cand}'")
    psql("DELETE FROM com_company WHERE company_name LIKE 'BATCH-T%'")
    psql("DELETE FROM product_code WHERE main_code LIKE 'KDW-BT%'")
    print("정리 — 알림 read·BOM 프로브·거래처/제품코드 psql", flush=True)

print(f"\nlive_wiring_actions: {n}/{n} PASS")

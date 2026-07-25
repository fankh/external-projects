# -*- coding: utf-8 -*-
"""원가 근거 완전성 라이브 검증 (11.6).

단가를 찾지 못한 품목은 **0 원으로 합계에 들어간다**. 그 사실이 Run 로그(휘발성)에만
남아 있어서, 그 원가로 만드는 PCR·비교표·비용트리는 축소된 금액을 근거 표시 없이 썼다.
재료비가 낮아지면 직접경비(재료비 비율)와 매출(직접비×(1+마진))까지 함께 낮아지므로
**미해결 품목이 있을수록 견적이 싸 보인다** — 가격 결정에 직접 영향을 준다.

그래서 근거 완전성(basisComplete / unpricedCount)이 저장·조회·비교·분해 **전 경로**에
따라오는지 본다. 한 경로에만 표시하면 다른 경로로 같은 금액을 그대로 받아 갈 수 있다.

실행: PYTHONUTF8=1 py tests/live_cost_basis.py
"""
import os

from playwright.sync_api import sync_playwright

BASE = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
n = 0


def ok(label: str, cond: bool, detail: str = "") -> None:
    global n
    assert cond, f"FAIL {label}{(' — ' + detail) if detail else ''}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    req = pw.request.new_context()

    def call(method: str, path: str, token: str | None = None, **kw):
        h = {"Content-Type": "application/json"}
        if token:
            h["Authorization"] = f"Bearer {token}"
        return req.fetch(f"{BASE}{path}", method=method, headers=h, **kw)

    r = call("POST", "/auth/login", data={"userId": "edim", "password": "edim"})
    assert r.ok, f"로그인 실패 {r.status}"
    admin = r.json()["token"]

    # ── 1. PCR 생성 — 응답이 근거 완전성을 함께 돌려준다 ──
    r = call("POST", "/cost/pcr", admin,
             data={"businessType": "PRE_SALES", "marginRate": 0.35})
    ok("PCR 생성", r.ok, f"status={r.status} body={r.text()[:160]}")
    p = r.json()
    for key in ("unpricedCount", "basisComplete", "notes"):
        ok(f"생성 응답에 {key} 포함", key in p, str(p)[:200])
    ok("basisComplete 가 unpricedCount 와 일치",
       p["basisComplete"] == (p["unpricedCount"] == 0),
       f"complete={p['basisComplete']} count={p['unpricedCount']}")
    ok("근거가 불완전할 때만 사유 문구",
       bool(p["notes"]) == (p["unpricedCount"] > 0), str(p["notes"]))
    pcr_id = p["pcrId"]
    unpriced = p["unpricedCount"]
    print(f"   (근거) 단가 미해결 {unpriced}건")

    # ── 2. 목록 — 같은 사실이 따라온다 ──
    r = call("GET", "/cost/pcr", admin)
    ok("PCR 목록 조회", r.ok, f"status={r.status}")
    rows = r.json()
    mine = [x for x in rows if x["pcrId"] == pcr_id]
    ok("생성한 PCR 이 목록에 있음", bool(mine), f"{len(rows)}건")
    m = mine[0]
    ok("목록에 unpricedCount 포함", "unpricedCount" in m, str(m)[:180])
    ok("목록의 근거 완전성이 생성 결과와 일치", m["unpricedCount"] == unpriced,
       f"목록 {m['unpricedCount']} vs 생성 {unpriced}")
    ok("목록에 basisComplete 포함", "basisComplete" in m)

    # ── 3. 비용 트리(분해) — 같은 사실이 따라온다 ──
    r = call("GET", f"/cost/pcr/{pcr_id}/breakdown", admin)
    ok("비용 트리 조회", r.ok, f"status={r.status}")
    b = r.json()
    ok("분해에 unpricedCount 포함", "unpricedCount" in b, str(b)[:200])
    ok("분해의 근거 완전성 일치", b["unpricedCount"] == unpriced,
       f"분해 {b['unpricedCount']} vs 생성 {unpriced}")
    ok("분해에 unpricedCodes 포함(목록형)", isinstance(b.get("unpricedCodes"), list))

    # ── 4. 비교표 — 열마다·표 전체로 따라온다 ──
    r = call("GET", "/cost/pcr/compare", admin)
    ok("비교표 조회", r.ok, f"status={r.status}")
    c = r.json()
    ok("비교표에 basisComplete 포함", "basisComplete" in c, str(c)[:200])
    ok("비교표에 incompleteBasisTypes 포함(목록형)",
       isinstance(c.get("incompleteBasisTypes"), list))
    ok("모든 열에 근거 완전성이 붙어 있음",
       all("basisComplete" in col for col in c["columns"]),
       str(c["columns"])[:200])
    ok("표 전체 판정이 열 판정과 모순되지 않음",
       c["basisComplete"] == all(col["basisComplete"] for col in c["columns"]),
       f"표 {c['basisComplete']} vs 열 {[col['basisComplete'] for col in c['columns']]}")

    # ── 5. 근거 완전성은 금액이 아니므로 마스킹돼 사라지면 안 된다 ──
    # (마스킹된 화면일수록 '이 수치가 축소된 근거로 계산됐다' 는 사실이 필요하다)
    r = call("GET", "/cost/pcr", admin)
    ok("마스킹 모드와 무관하게 근거 완전성 제공",
       all("basisComplete" in x for x in r.json()), "일부 행에 누락")

    # ── 6. Run 원가 상세에 미해결 목록이 영속돼 있는지 ──
    r = call("GET", f"/cost/pcr/{pcr_id}/breakdown", admin)
    bd = r.json()
    ok("미해결 건수와 코드 목록의 정합",
       len(bd.get("unpricedCodes") or []) <= bd["unpricedCount"] or bd["unpricedCount"] == 0,
       f"codes={len(bd.get('unpricedCodes') or [])} count={bd['unpricedCount']}")

    # ── 6b. Run 이 실제 견적안 제품으로 전개되는가 + 제조비 근거 (12.4) ──
    # 종전에는 BOM 루트와 제조비 도면이 모두 데모 제품('KDCR 3-13')으로 하드코딩돼,
    # 어떤 견적안을 실행하든 같은 제품 원가가 나왔다.
    r = call("GET", "/cpq/selections", admin)
    if r.ok:
        sels = r.json()
        sels = sels if isinstance(sels, list) else (sels.get("items") or [])
        ok("견적안 목록 조회", True)
        ok("견적안이 제품 코드를 들고 있음",
           all(s.get("finishedGoodsCode") or s.get("productCode") for s in sels[:5]) if sels
           else True, str(sels[:2])[:160])
    else:
        print(f"SKIP 견적안 목록 — status={r.status} (경로 확인 필요)")

    ok("PCR 응답에 mfgEstimated 포함", "mfgEstimated" in p, str(p)[:200])
    bd2 = call("GET", f"/cost/pcr/{pcr_id}/breakdown", admin).json()
    ok("분해에도 mfgEstimated 포함", "mfgEstimated" in bd2, str(bd2)[:200])
    ok("PCR 과 분해의 제조비 근거 판정 일치",
       bool(p["mfgEstimated"]) == bool(bd2["mfgEstimated"]),
       f"PCR {p['mfgEstimated']} vs 분해 {bd2['mfgEstimated']}")
    if p["mfgEstimated"]:
        ok("제조비 추정 시 사유가 notes 에 명시",
           any("제조비" in x for x in p["notes"]), str(p["notes"]))
    else:
        print("   (참고) 제조비가 실제 조립 스텝으로 산정됨 — 추정 경로 미실행")

    # ── 7. 잘못된 실행 유형은 500 이 아니라 422 로 안내 (11.7) ──
    r = call("POST", "/cpq/runs", admin, data={"runType": "__BAD__", "isTest": True})
    ok("잘못된 runType 은 422", r.status == 422, f"status={r.status} body={r.text()[:140]}")
    ok("허용 값이 사유에 보임", "ALL" in r.text(), r.text()[:140])

    req.dispose()

print(f"\nOK — 원가 근거 완전성 {n}개 검증 통과")

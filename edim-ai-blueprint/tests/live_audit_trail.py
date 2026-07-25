# -*- coding: utf-8 -*-
"""감사 추적·알림 도달 검증 (13.8).

전수 조사에서 **업무 쓰기 32곳에 감사 기록이 없었다** — 누가 언제 무엇을 바꿨는지 남지
않는 자리다. 문서·설계 통제 제품에서 감사 추적은 기능이 아니라 전제다(SYS-005·B8).
위험이 큰 것부터(단가·거래처·BOM 관계·계산식·승인 요청·설계 치수) 채우고,
정적 게이트(`check_audit_coverage`)로 증가를 막았다.

함께 잡은 것: 승인 요청 알림 대상이 `('SETUP','ADMIN')` 뿐이라 **PLATFORM 승인자가
빠졌다** — 레벨이 더 높은데 알림을 못 받아, 그 사람만 있는 조직에서는 요청이 온 줄 모른다.

검증 자원은 스스로 정리한다.

실행: PYTHONUTF8=1 py tests/live_audit_trail.py
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

    def history(table: str, action: str = "", limit: int = 200):
        """전용 감사 조회(D9, ADMIN) — 대상 테이블 필터.

        /history 는 최근 N건을 전체 대상으로 돌려줄 뿐 대상 필터가 없어, 특정 자산의
        이력을 추적할 수 없다(감사 목적에는 /audit 가 맞다).
        """
        q = f"/audit?target={table}&limit={limit}" + (f"&action={action}" if action else "")
        r = call("GET", q, admin)
        if not r.ok:
            return None
        return (r.json() or {}).get("rows") or []

    def target_id_of(row) -> str:
        # target 은 'table #id' 형태
        return str(row.get("target") or "").rsplit("#", 1)[-1].strip()

    # ── 0. 감사 조회 경로가 살아 있는지 ──
    rows = history("sys_approval_request")
    ok("감사 이력 조회", rows is not None, "GET /history 실패")

    # ── 1. 승인 요청 — 기록과 알림 ──
    r = call("POST", "/approvals", admin, data={
        "targetTable": "sys_hierarchy", "targetId": 1, "label": "감사 검증용 요청"})
    ok("승인 요청 생성", r.status in (200, 201), f"status={r.status} body={r.text()[:140]}")
    aid = r.json().get("approvalId") or r.json().get("id")

    rows = history("sys_approval_request") or []
    mine = [x for x in rows if target_id_of(x) == str(aid)]
    ok("승인 요청이 감사에 남음", bool(mine),
       f"최근 {len(rows)}건에 #{aid} 없음 — 요청 생성이 기록되지 않는다")
    act = str(mine[0].get("action") or "")
    ok("액션이 REQUEST 로 기록", act == "REQUEST", act)
    ok("행위자가 기록됨", bool(mine[0].get("by") or mine[0].get("login")),
       str(mine[0])[:180])

    # 알림 — 요청자 본인은 제외되므로 edim(=요청자) 알림에는 이 건이 없어야 한다
    r = call("GET", "/notifications?limit=50", admin)
    ok("알림 조회", r.ok, f"status={r.status}")
    titles = [str(x.get("title") or "") for x in r.json()]
    ok("요청자 본인에게는 자기 요청 알림이 가지 않음",
       not any("감사 검증용 요청" in t for t in titles), str(titles[:3]))

    # ── 2. BOM 관계 삭제 — 원가·소요량이 달라지는 변경 ──
    # (단가·거래처도 감사를 채웠지만 **삭제 경로가 없는 이력 자산**이라 라이브에서 만들면
    #  잔재가 남는다. 정리 가능한 관계 삭제로 같은 계열을 검증한다.)
    # 그룹은 **삭제 경로가 없다** — 검증용으로 새로 만들면 매 실행 잔재가 된다.
    # GEN 은 수기 코드용 상설 그룹(Slot 미정의)이라 그대로 쓴다.
    GROUP, C1, C2 = "GEN", "ZAUD-A", "ZAUD-B"

    def products():
        r = call("GET", "/codes/products", admin)
        rows = r.json() if r.ok else []
        rows = rows if isinstance(rows, list) else (rows.get("items") or [])
        return [x for x in rows if str(x.get("mainCode")) in (C1, C2)]

    def cleanup_codes():
        for c in (C1, C2):
            rr = call("GET", f"/codes/{c}/referencers", admin)
            if rr.ok:
                for x in rr.json():
                    if x.get("relId"):
                        call("DELETE", f"/codes/relationships/{x['relId']}", admin)
        for pr in products():
            call("DELETE", f"/codes/products/{pr.get('productCodeId') or pr.get('id')}", admin)

    cleanup_codes()
    for c in (C1, C2):
        call("POST", "/codes/products", admin,
             data={"mainCode": c, "codeName": f"감사검증 {c}", "groupCode": GROUP})
    ok("검증용 코드 2종 확보", len(products()) == 2, f"{len(products())}개")

    r = call("POST", "/codes/relationships", admin, data={"mother": C1, "child": C2, "qty": 1})
    ok("관계 등록", r.status == 201, f"status={r.status} body={r.text()[:140]}")
    rel_id = r.json()["relId"]

    r = call("DELETE", f"/codes/relationships/{rel_id}", admin)
    ok("관계 삭제", r.ok, f"status={r.status}")
    rows = history("code_relationship") or []
    hit = [x for x in rows if target_id_of(x) == str(rel_id)
           and str(x.get("action")) == "DELETE"]
    ok("관계 삭제가 감사에 남음", bool(hit),
       f"#{rel_id} DELETE 없음 — BOM 구성이 소리 없이 바뀐다")
    ok("행위자가 기록됨", bool(hit[0].get("by") or hit[0].get("login")),
       str(hit[0])[:180])

    # ── 3. 정리 ──
    call("POST", f"/approvals/{aid}/decide", admin,
         data={"approve": True, "comment": "감사 검증 정리"})
    ok("검증 승인 요청 정리",
       not any(x["id"] == aid for x in call("GET", "/approvals/inbox", admin).json()))
    cleanup_codes()
    ok("검증용 코드 정리", not products(), f"잔재 {len(products())}개")

    req.dispose()

print(f"\nOK — 감사 추적 {n}개 검증 통과")

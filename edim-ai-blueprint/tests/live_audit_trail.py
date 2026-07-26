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
    # 앞선 실행이 중단되면 미결 요청이 남아 재실행이 409 로 막힌다(같은 대상 PENDING 1건 제한).
    # 스위트는 자기 잔재를 스스로 치운다.
    for x in call("GET", "/approvals/inbox", admin).json():
        if "감사 검증용" in str(x.get("target") or "") or str(x.get("id")) == "":
            call("POST", f"/approvals/{x['id']}/decide", admin,
                 data={"approve": True, "comment": "이전 실행 잔재 정리"})
    r0 = call("GET", "/approvals/inbox", admin).json()
    for x in r0:
        # sys_hierarchy #1 대상은 이 스위트가 쓰는 자리 — 남아 있으면 정리한다
        if str(x.get("target") or "").startswith("sys_hierarchy #1"):
            call("POST", f"/approvals/{x['id']}/decide", admin,
                 data={"approve": True, "comment": "이전 실행 잔재 정리"})

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

    # ── 2b. 데이터 테이블 수정 — before/after 대조 (14.3) ──
    # 치수·원가 계산의 판단 근거라, 무엇이 어떻게 바뀌었는지 남지 않으면
    # 금액 이의 제기 때 대조가 불가능하다.
    r = call("GET", "/tables", admin)
    tabs = r.json() if r.ok else []
    tabs = tabs if isinstance(tabs, list) else (tabs.get("items") or [])
    tname = next((str(t.get("name") or t.get("tableName")) for t in tabs
                  if t.get("name") or t.get("tableName")), "")
    ok("데이터 테이블 확보", bool(tname), str(tabs[:2])[:160])

    KEY = "ZAUDROW"
    call("DELETE", f"/tables/{tname}/rows/{KEY}", admin)
    r = call("POST", f"/tables/{tname}/rows", admin,
             data={"key": KEY, "values": {"A": 1}})
    ok("행 추가", r.status in (200, 201), f"status={r.status} body={r.text()[:140]}")
    r = call("PUT", f"/tables/{tname}/rows/{KEY}", admin,
             data={"key": KEY, "values": {"A": 2}})
    ok("행 수정", r.ok, f"status={r.status} body={r.text()[:140]}")

    rows = history("tbl_data_row", action="ROW_SAVE") or []
    hit = [x for x in rows if KEY in str(x.get("after") or "")]
    ok("행 수정이 감사에 남음", bool(hit), f"ROW_SAVE 에 {KEY} 없음")
    ok("변경 전 값이 함께 기록 (대조 가능)",
       KEY in str(hit[0].get("before") or ""), str(hit[0].get("before"))[:160])

    r = call("DELETE", f"/tables/{tname}/rows/{KEY}", admin)
    ok("행 삭제", r.ok, f"status={r.status}")
    rows = history("tbl_data_row", action="ROW_DELETE") or []
    ok("행 삭제가 지운 값과 함께 기록",
       any(KEY in str(x.get("before") or "") for x in rows),
       "ROW_DELETE before 없음 — 복구 판단에 원본이 필요하다")

    # ── 2c. CAD 부품도 저장 — 신규/덮어쓰기 구분 (14.9) ──
    # 같은 이름이면 원본을 덮어쓰는 되돌릴 수 없는 연산이다. 무엇을 갈아끼웠는지 남지 않으면
    # 납품물 대조가 불가능하다.
    r = call("POST", "/cad/part-drawing/save", admin,
             data={"project": "PS-61313-5", "dims": {"A": 1200, "B": 600}})
    ok("부품도 저장(1회차)", r.ok, f"status={r.status} body={r.text()[:140]}")
    r = call("POST", "/cad/part-drawing/save", admin,
             data={"project": "PS-61313-5", "dims": {"A": 1210, "B": 600}})
    ok("부품도 저장(2회차 — 같은 이름)", r.ok, f"status={r.status}")

    rows = history("dwg_file") or []
    saves = [x for x in rows if str(x.get("action")) in ("CAD_SAVE", "CAD_OVERWRITE")]
    ok("CAD 저장이 감사에 남음", bool(saves), "CAD_SAVE/CAD_OVERWRITE 없음")
    ok("덮어쓰기가 신규와 구분돼 기록",
       any(str(x.get("action")) == "CAD_OVERWRITE" for x in saves),
       f"{[x.get('action') for x in saves[:4]]} — 2회차는 덮어쓰기여야 한다")
    ok("무엇을 덮어썼는지 기록",
       any("file" in str(x.get("after") or "") for x in saves), str(saves[0])[:180])

    # ── 2d. 감사 조회·검색이 조용히 잘리지 않는가 (16.2) ──
    # 감사 조회는 규정 대응에 쓰인다 — 잘린 결과를 전부로 오해하면
    # "그런 기록은 없다" 는 잘못된 결론이 나온다.
    r = call("GET", "/audit?limit=5", admin)
    ok("감사 조회(상한 5)", r.ok, f"status={r.status}")
    a5 = r.json()
    for key in ("truncated", "limit", "note", "count"):
        ok(f"감사 응답에 {key} 포함", key in a5, str(a5)[:160])
    ok("상한만큼만 반환", a5["count"] == 5, str(a5["count"]))
    ok("잘렸음을 알림", a5["truncated"] is True, str(a5["truncated"]))
    ok("안내 문구에 대처 방법", "필터" in a5["note"] or "limit" in a5["note"], a5["note"][:120])

    r = call("GET", "/audit?limit=2000", admin)
    big = r.json()
    ok("truncated 가 실제 상한 도달 여부와 일치",
       big["truncated"] == (big["count"] >= big["limit"]),
       f"count={big['count']} limit={big['limit']} truncated={big['truncated']}")

    # 통합 검색 — 그룹당 상한에서 잘리면 '더 있음' 을 알려야 한다
    r = call("GET", "/search?q=KD", admin)
    ok("통합 검색 호출", r.ok, f"status={r.status}")
    sr = r.json()
    ok("검색 응답에 hasMore 포함 (결과가 없어도 키는 있다)", "hasMore" in sr, str(sr)[:160])
    ok("hasMore 는 목록형", isinstance(sr["hasMore"], list), str(sr.get("hasMore")))
    over = [k for k, v in sr.items()
            if isinstance(v, list) and k != "hasMore" and len(v) > 8]
    ok("어떤 그룹도 상한(8)을 넘겨 반환하지 않음", not over, str(over))

    # ── 3. 정리 ──
    call("POST", f"/approvals/{aid}/decide", admin,
         data={"approve": True, "comment": "감사 검증 정리"})
    ok("검증 승인 요청 정리",
       not any(x["id"] == aid for x in call("GET", "/approvals/inbox", admin).json()))
    cleanup_codes()
    ok("검증용 코드 정리", not products(), f"잔재 {len(products())}개")

    req.dispose()

print(f"\nOK — 감사 추적 {n}개 검증 통과")

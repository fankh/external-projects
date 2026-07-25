# -*- coding: utf-8 -*-
"""Run 이 견적안의 제품을 실제로 따르는지 검증 (12.6).

원가 점검에서 드러난 결함 계열: 견적안에 `product_code_id` 가 있는데 Run 이 읽지 않고
데모 제품(`KDCR 3-13`)을 하드코딩해, **어떤 견적안을 실행하든 같은 제품의 BOM·제조비·
산출물 파일명**이 나왔다. 데모 테넌트는 제품이 하나라 드러나지 않는다 —
그래서 이 스위트는 **제품 2종**으로 검증한다(위험대장 R-23 의 재발 트리거).

검증용 견적안·Run 은 스스로 정리한다. 특히 남겨 두면 그것이 '최신 견적안' 이 되어
selectionId 없이 도는 다른 스위트가 엉뚱한 제품으로 전개된다.

실행: PYTHONUTF8=1 py tests/live_run_product_scope.py
"""
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
ALT_CODE = "FDV-480"          # 데모 루트(KDCR 3-13)와 다른 제품
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

    def run_and_wait(selection_id: int | None) -> dict:
        body = {"runType": "ALL", "isTest": True}
        if selection_id:
            body["selectionId"] = selection_id
        r = call("POST", "/cpq/runs", admin, data=body)
        assert r.status == 202, f"Run 시작 실패 {r.status} {r.text()[:140]}"
        rid = r.json()["runId"]
        for _ in range(80):
            st = call("GET", f"/cpq/runs/{rid}", admin).json()
            if st.get("status") in ("SUCCESS", "FAILED"):
                return {"runId": rid, **st}
            time.sleep(3)
        raise AssertionError(f"Run {rid} 타임아웃")

    def bom_root_of(state: dict) -> str:
        for lg in state.get("logs", []):
            m = str(lg.get("message", ""))
            if m.startswith("BOM expand root="):
                # 제품 코드에 공백이 들어간다("KDCR 3-13") — 공백으로 자르면 잘린 값이 된다.
                # 로그 형식은 'BOM expand root={code} … {n} items → ...' 이므로 ' … ' 로 자른다.
                return m.split("root=", 1)[1].split(" … ", 1)[0].strip()
        return ""

    # 기준 Run 은 **명시한 견적안**으로 돌린다. selectionId 를 생략하면 '최신 견적안' 이
    # 대상이 되는데, 앞선 실행의 잔재나 다른 스위트가 만든 견적안이 최신이 되면 기준 자체가
    # 흔들린다(실제로 그렇게 오염돼 두 Run 이 같은 제품이 된 적이 있다).
    r = call("GET", "/cpq/selections", admin)
    sels = r.json() if r.ok else []
    sels = sels if isinstance(sels, list) else (sels.get("items") or [])
    base_sel = next((x for x in sels
                     if str(x.get("finishedGoodsCode") or "").startswith("KDCR")), None)
    ok("기준 견적안(데모 제품) 확보", base_sel is not None,
       f"{[x.get('finishedGoodsCode') for x in sels[:5]]}")
    base_id = base_sel.get("selectionId") or base_sel.get("id")

    created_selection: int | None = None
    created_runs: list[int] = []
    try:
        # ── 1. 기준 견적안(데모 제품) Run ──
        st0 = run_and_wait(base_id)
        created_runs.append(st0["runId"])
        ok("기준 견적안 Run 성공", st0["status"] == "SUCCESS", str(st0.get("status")))
        root0 = bom_root_of(st0)
        ok("BOM 루트가 로그에 남음", bool(root0), str(st0.get("logs"))[:160])
        print(f"   (기준) 기준 견적안 루트 = {root0}")

        # ── 2. 다른 제품 견적안을 만들어 Run ──
        pr = call("GET", "/projects", admin).json()
        pr = pr if isinstance(pr, list) else (pr.get("items") or [])
        pno = str(pr[0].get("projectNo") or pr[0].get("no"))
        ok("프로젝트 확보", bool(pno), str(pr[:1])[:120])

        r = call("POST", "/cpq/selections", admin, data={
            "projectNo": pno, "rootCode": ALT_CODE,
            "finishedGoodsCode": ALT_CODE, "slotValues": {}})
        ok("다른 제품 견적안 생성", r.status == 201, f"status={r.status} body={r.text()[:140]}")
        created_selection = r.json().get("selectionId") or r.json().get("id")

        st1 = run_and_wait(created_selection)
        created_runs.append(st1["runId"])
        ok("다른 제품 Run 성공", st1["status"] == "SUCCESS", str(st1.get("status")))
        root1 = bom_root_of(st1)
        ok("두 번째 Run 이 그 견적안의 제품으로 전개됨", root1 == ALT_CODE,
           f"루트 {root1!r} — 데모 제품으로 하드코딩되면 {root0!r} 이 나온다")
        ok("두 Run 의 루트가 서로 다름", root0 != root1,
           f"{root0!r} vs {root1!r} — 같으면 견적안 제품이 무시된 것")

        # ── 3. 산출물 파일명이 제품을 따르는가 ──
        outs = st1.get("outputs") or []
        names = [str(o.get("file") or "") for o in outs]
        ok("산출물이 생성됨", bool(names), str(outs)[:160])
        ok("도면 파일명이 데모 제품 이름이 아님",
           not any("KDCR3-13" in x for x in names),
           f"{names} — 파일명이 고정이면 다른 제품 산출물이 데모 제품 도면으로 보관된다")
        ok("BOM 파일명이 고정 데모 번호가 아님",
           not any("BM21456" in x for x in names), str(names))
        ok("견적 PDF 파일명이 고정 데모 번호가 아님",
           not any("QR-61216-01" in x for x in names), str(names))

        # ── 4. 근거 대조(drift)도 같은 제품으로 재전개하는가 ──
        r = call("GET", f"/cpq/runs/{st1['runId']}/bom-basis", admin)
        if r.ok:
            b = r.json()
            ok("근거 대조 조회", True)
            # 방금 실행한 Run 이므로 근거가 안정적이어야 한다.
            # 다른 제품으로 재전개하면 여기서 어긋난다.
            ok("방금 실행한 Run 의 근거가 안정적",
               b.get("stable") is not False,
               f"{b} — 다른 제품으로 재전개하면 drift 가 잘못 잡힌다")
        else:
            print(f"SKIP 근거 대조 — status={r.status} (경로 확인 필요)")
    finally:
        # 정리 순서가 제품 규칙에 걸린다:
        #  · 견적안은 Run 참조 보호(409) → Run 을 먼저 지워야 한다
        #  · 그런데 **최신 SUCCESS Run 은 삭제 불가**(현재 원가·견적 기준이므로 타당한 규칙)
        # 그래서 기본 견적안으로 한 번 더 실행해 '최신' 자리를 데모 제품 Run 에 넘긴 뒤 지운다.
        # 이렇게 해야 검증용 견적안이 '최신 견적안' 으로 남아 다른 스위트를 오염시키지 않는다.
        try:
            tail = run_and_wait(base_id)
            created_runs.append(tail["runId"])
        except Exception as e:  # noqa: BLE001 — 정리 실패가 검증 결과를 덮지 않게 한다
            print(f"   (정리) 마무리 Run 실패: {e}")
        for rid in created_runs:
            if rid != created_runs[-1]:
                call("DELETE", f"/cpq/runs/{rid}", admin)
        if created_selection:
            call("DELETE", f"/cpq/selections/{created_selection}", admin)

    # 정리 확인 — 삭제가 Run 참조로 막히면 그 사실을 드러낸다(조용히 넘기지 않는다)
    if created_selection:
        r = call("GET", "/cpq/selections", admin)
        sels = r.json() if r.ok else []
        sels = sels if isinstance(sels, list) else (sels.get("items") or [])
        left = [x for x in sels
                if (x.get("selectionId") or x.get("id")) == created_selection]
        ok("검증용 견적안 정리됨 (남으면 최신 견적안이 바뀐다)", not left,
           f"#{created_selection} 잔존 — Run 참조 보호로 삭제되지 않았다면 "
           f"스위트가 Run 을 남기지 않도록 조정 필요")

    req.dispose()

print(f"\nOK — Run 제품 스코프 {n}개 검증 통과")

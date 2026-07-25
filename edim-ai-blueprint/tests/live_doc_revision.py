# -*- coding: utf-8 -*-
"""문서 개정 버전 자동 증가 검증 (13.1, 규격 DOC-001).

규격은 "개정 Version(KD-0.2 등) **자동 증가**" 인데, 버전은 생성 시 `KD-0.1` 로 고정되고
**올리는 경로가 없었다**. 스키마는 `UNIQUE(tenant_id, doc_no, version)` 으로 다중 버전을
전제하는데 만드는 코드가 없어, 모든 문서가 최초 버전에 머물렀다.

검증용 문서는 스스로 만들고 지운다. 개정본은 SET_UP 이라 삭제 가능하고, 원본은 상태를
되돌릴 수 없으므로 **검증 전용 DOC No** 를 쓴다(기존 문서를 건드리지 않는다).

실행: PYTHONUTF8=1 py tests/live_doc_revision.py
"""
import os

from playwright.sync_api import sync_playwright

BASE = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
DOC_NO = "ZREV-0001"
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

    def rows_of(doc_no: str):
        r = call("GET", f"/documents?q={doc_no}", admin)
        if not r.ok:
            return []
        rows = r.json()
        rows = rows if isinstance(rows, list) else (rows.get("items") or [])
        return [x for x in rows if str(x.get("docNo")) == doc_no]

    def purge():
        """최신 행부터 반복 삭제. 삭제는 SET_UP 한정이므로, 진행된 상태면
        SET_UP 으로 되돌린 뒤 지운다(CHECK→SET_UP 은 허용된 전이)."""
        for _ in range(8):
            if not rows_of(DOC_NO):
                return
            if call("DELETE", f"/documents/{DOC_NO}", admin).ok:
                continue
            back = call("PATCH", f"/documents/{DOC_NO}/status", admin,
                        data={"status": "SET_UP"})
            if not back.ok:
                return

    purge()

    # ── 1. 문서 생성 — 초기 버전 ──
    r = call("POST", "/documents", admin, data={
        "docNo": DOC_NO, "title": "개정 검증용 문서", "docType": "TECH_DOC", "grade": "S-3"})
    ok("검증 문서 생성", r.status == 201, f"status={r.status} body={r.text()[:140]}")
    cur = rows_of(DOC_NO)
    ok("생성 문서가 목록에 1건", len(cur) == 1, f"{len(cur)}건")
    v0 = str(cur[0].get("version"))
    ok("초기 버전이 채워짐", bool(v0) and v0 != "None", v0)
    print(f"   (기준) 초기 버전 = {v0}")

    # ── 2. 작성 중(SET_UP)은 개정 대상이 아니다 ──
    r = call("POST", f"/documents/{DOC_NO}/revise", admin, data={})
    ok("SET_UP 문서 개정 거부(409)", r.status == 409,
       f"status={r.status} body={r.text()[:140]}")
    ok("거부 사유가 상태임을 알 수 있음", "SET_UP" in r.text(), r.text()[:140])

    # ── 3. 발행 상태로 올린 뒤 개정 ──
    adv = call("PATCH", f"/documents/{DOC_NO}/status", admin, data={"status": "CHECK"})
    if not adv.ok:
        adv = call("POST", f"/documents/{DOC_NO}/status", admin, data={"status": "CHECK"})
    ok("문서 상태 전이(CHECK)", adv.ok, f"status={adv.status} body={adv.text()[:140]}")

    r = call("POST", f"/documents/{DOC_NO}/revise", admin, data={})
    ok("개정 성공", r.status == 201, f"status={r.status} body={r.text()[:160]}")
    rev = r.json()
    ok("이전 버전이 응답에 명시", rev["fromVersion"] == v0, str(rev))
    ok("버전이 소수부 +1 로 증가",
       rev["version"] != v0 and rev["version"].rsplit(".", 1)[0] == v0.rsplit(".", 1)[0]
       and int(rev["version"].rsplit(".", 1)[1]) == int(v0.rsplit(".", 1)[1]) + 1,
       f"{v0} → {rev['version']}")
    ok("개정본은 작성 중(SET_UP)으로 시작", rev["status"] == "SET_UP", str(rev))

    # ── 4. 이전 버전이 이력으로 남는다 ──
    after = rows_of(DOC_NO)
    ok("같은 DOC No 로 2개 버전 존재", len(after) == 2, f"{len(after)}건")
    versions = sorted(str(x.get("version")) for x in after)
    ok("두 버전이 서로 다름", len(set(versions)) == 2, str(versions))
    ok("이전 버전이 보존됨", v0 in versions, str(versions))

    # ── 5. 같은 버전 중복 생성은 막힌다 ──
    # (개정본이 SET_UP 이라 다시 개정하면 409 — 상태 규칙이 중복도 함께 막는다)
    r = call("POST", f"/documents/{DOC_NO}/revise", admin, data={})
    ok("연속 개정은 상태 규칙으로 차단(409)", r.status == 409, f"status={r.status}")

    ok("없는 문서 개정 404",
       call("POST", "/documents/__NOSUCH__/revise", admin, data={}).status == 404)
    ok("무인증 개정 차단(401)",
       call("POST", f"/documents/{DOC_NO}/revise", data={}).status == 401)

    # ── 6. 정리 ──
    purge()
    ok("정리 후 잔재 0", not rows_of(DOC_NO), f"잔재 {len(rows_of(DOC_NO))}건")

    req.dispose()

print(f"\nOK — 문서 개정 {n}개 검증 통과")

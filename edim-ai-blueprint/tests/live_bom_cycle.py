# -*- coding: utf-8 -*-
"""BOM 순환·전개 무결성 라이브 검증 (10.9).

두 가지 결함을 고정한다.
1) **간접 순환이 막히지 않았다** — 직접 자기참조(mother==child)만 막아서 A→B 가 있는 상태에서
   B→A 를 등록할 수 있었다. 전개 쿼리는 순환 간선을 조용히 버리므로(무한 재귀 방지)
   **원가·소요량이 말없이 적게 집계**됐다.
2) **Running Test 가 계산 없이 `passed:true, cycleCheck:"OK"` 를 고정 반환했다** —
   순환이나 깊이 상한으로 일부만 전개돼도 전량 전개로 보였다(응답 정직성 규약 위반).

검증용 그룹·코드·관계는 스스로 만들고 끝나면 지운다(잔재 0 확인).

실행: PYTHONUTF8=1 py tests/live_bom_cycle.py
"""
import os

from playwright.sync_api import sync_playwright

BASE = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
GROUP = "ZCYCG"
CODES = ["ZCYC-A", "ZCYC-B", "ZCYC-C"]
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

    def products():
        t = call("GET", "/codes/products", admin).json()
        return t if isinstance(t, list) else (t.get("items") or [])

    def mine():
        return [p for p in products() if str(p.get("mainCode") or "") in CODES]

    rel_ids: list[int] = []

    def purge():
        """관계를 먼저 지워야 코드가 지워진다(참조 보호)."""
        for rid in list(rel_ids):
            call("DELETE", f"/codes/relationships/{rid}", admin)
        rel_ids.clear()
        for p in mine():
            call("DELETE", f"/codes/products/{p.get('productCodeId') or p.get('id')}", admin)

    purge()

    # ── 1. 픽스처: slot 이 없는 그룹 + 제품코드 3개 ──
    g = call("POST", "/codes/groups", admin, data={
        "groupCode": GROUP, "groupName": "순환검증그룹", "groupType": "SPECIFICATION"})
    ok("검증용 그룹 준비 (생성 201 또는 기존 409)", g.status in (201, 409), f"status={g.status}")

    made = 0
    for c in CODES:
        r = call("POST", "/codes/products", admin,
                 data={"mainCode": c, "codeName": f"순환검증 {c}", "groupCode": GROUP})
        if r.status == 201:
            made += 1
        elif r.status != 409:
            ok(f"{c} 생성", False, f"status={r.status} body={r.text()[:120]}")
    ok("검증용 제품코드 3개 확보", len(mine()) == 3, f"{len(mine())}개 (신규 {made})")

    def add(mother: str, child: str):
        r = call("POST", "/codes/relationships", admin,
                 data={"mother": mother, "child": child, "qty": 1})
        if r.status == 201:
            rel_ids.append(r.json()["relId"])
        return r

    # ── 2. 정상 관계 A→B→C ──
    ok("A→B 등록", add(CODES[0], CODES[1]).status == 201)
    ok("B→C 등록", add(CODES[1], CODES[2]).status == 201)

    # ── 3. 순환이 되는 등록은 거부돼야 한다 ──
    ok("자기참조 A→A 거부(422)", add(CODES[0], CODES[0]).status == 422)
    r = add(CODES[1], CODES[0])
    ok("간접 순환 B→A 거부(409)", r.status == 409, f"status={r.status} body={r.text()[:140]}")
    ok("거부 사유에 순환 경로가 보임", "ZCYC" in r.text(), r.text()[:140])
    ok("2단계 건너뛴 순환 C→A 거부(409)", add(CODES[2], CODES[0]).status == 409)
    ok("중복 관계 재등록 거부(409)", add(CODES[0], CODES[1]).status == 409)
    ok("거부된 등록이 관계를 만들지 않음", len(rel_ids) == 2, f"{len(rel_ids)}건")

    # ── 4. Running Test 가 실제 계산값을 돌려주는지 ──
    r = call("POST", "/codes/relationships/running-test", admin,
             data={"motherCode": CODES[0], "slotValues": {}})
    ok("Running Test 호출", r.ok, f"status={r.status} body={r.text()[:140]}")
    body = r.json()
    for key in ("passed", "cycleCheck", "cycles", "depthCapped", "maxLevel", "notes"):
        ok(f"응답에 {key} 포함 (고정값이 아니라 계산 결과)", key in body, str(body)[:160])
    ok("순환 없는 BOM 은 cycleCheck=OK", body["cycleCheck"] == "OK", str(body["cycleCheck"]))
    ok("cycles 비어 있음", body["cycles"] == [], str(body["cycles"]))
    ok("depthCapped 거짓", body["depthCapped"] is False)
    ok("passed 참", body["passed"] is True)
    ok("maxLevel 이 정수", isinstance(body["maxLevel"], int), str(body["maxLevel"]))
    # DRAFT 관계만 있으므로 전개 대상은 0 — 그 사유가 응답에 있어야 한다
    # (종전에는 "mother not found" 404 라 코드가 없는 것으로 오해했다)
    ok("전개 대상 0 사유가 notes 에 명시",
       any("승인된 하위 관계가 없" in x for x in body["notes"]), str(body["notes"]))
    ok("없는 코드는 404", call("POST", "/codes/relationships/running-test", admin,
                              data={"motherCode": "__NOSUCH__", "slotValues": {}}).status == 404)

    # ── 5. 정리 ──
    purge()
    ok("정리 후 코드 잔재 0", not mine(), f"잔재 {[p.get('mainCode') for p in mine()]}")

    req.dispose()

print(f"\nOK — BOM 순환·전개 무결성 {n}개 검증 통과")

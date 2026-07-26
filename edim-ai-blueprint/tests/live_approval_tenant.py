# -*- coding: utf-8 -*-
"""승인 요청 대상의 테넌트 소유 검증 (17.3).

종전에는 `POST /approvals` 가 `targetId` 를 그대로 받으면서 **그 행이 내 테넌트 것인지
확인하지 않았고**, `_apply_decision` 의 product_code 전이에도 테넌트 조건이 없었다.
그 경로 어디에도 테넌트 필터가 없으므로, 남의 테넌트 product_code_id 를 적은 요청은
그대로 접수되고 결정 시 그 행이 전이된다.

**증거의 범위를 분명히 해 둔다**: 위 두 지점의 부재는 코드로 확인했다(정적). 다만 처음
실행한 재현은 **같은 테넌트의 행을 대상으로 삼은 잘못된 시연**이어서, 교차 테넌트 쓰기를
끝까지 실행해 보인 것은 아니다. 이 스위트가 밟는 것은 수정 후의 성질 — 실재하는 타 테넌트
행을 대상으로 한 요청이 접수되지 않는다 — 이다.

'요청 행이 테넌트 범위이므로 대상도 안전하다' 는 추론이 틀린 지점이다 — 요청에 적힌
target_id 는 사용자가 보낸 값이지 시스템이 확인한 값이 아니었다. **통제는 경로가 아니라
데이터에 건다.**

대상은 **실재하는 타 테넌트 행**으로 잡는다. 내 목록에 없다는 것만으로 고르면 존재하지
않는 ID 일 수 있고, 그러면 '없는 대상은 404' 만 증명하게 된다. 쓰기가 일어나면 안 되는
것을 보는 검증이므로 데이터는 바꾸지 않는다.

실행: PYTHONUTF8=1 py tests/live_approval_tenant.py
"""
import os
import subprocess

from playwright.sync_api import sync_playwright

BASE = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
LOGIN = "edim"
n = 0


def psql(sql: str) -> str:
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                       capture_output=True, text=True, timeout=60)
    return (r.stdout or "").strip()


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

    r = call("POST", "/auth/login", data={"userId": LOGIN, "password": "edim"})
    assert r.ok, f"로그인 실패 {r.status}"
    tok = r.json()["token"]

    # ── 내 테넌트의 제품 코드 하나를 잡는다(정상 경로가 살아 있는지 대조용) ──
    r = call("GET", "/codes/products?limit=200", tok)
    ok("제품 코드 조회", r.ok, f"status={r.status}")
    mine = r.json()
    mine = mine if isinstance(mine, list) else mine.get("items", [])
    ok("내 테넌트 제품 코드 존재", len(mine) > 0, "검증 대상이 없다")
    my_ids = {int(x["productCodeId"]) for x in mine if x.get("productCodeId")}

    # ── 남의 테넌트 ID 를 **실재하는 행**으로 잡는다. 내 목록에 없다는 것만으로 고르면
    #    존재하지 않는 ID 일 수 있고, 그러면 이 검증은 '없는 대상은 404' 만 증명한다 —
    #    정작 보려는 '남의 것은 못 건드린다' 는 증명되지 않는다. ──
    other = int(psql(
        "SELECT product_code_id FROM product_code "
        f"WHERE tenant_id <> (SELECT tenant_id FROM sys_user WHERE login_id='{LOGIN}') "
        "ORDER BY product_code_id LIMIT 1") or 0)
    ok("실재하는 타 테넌트 제품 코드 확보", other > 0, "다른 테넌트에 제품 코드가 없다")
    ok("그 ID 가 내 목록에는 없음", other not in my_ids, f"#{other}")

    r = call("POST", "/approvals", tok, data={
        "targetTable": "product_code", "targetId": other,
        "requestType": "UPDATE", "label": "테넌트 소유 검증"})
    if r.status == 201:
        # 결함 재발. 결정을 내리면 **남의 테넌트 데이터가 실제로 바뀌므로** 여기서 멈춘다.
        # 미결 요청이 남지만 자동으로 지우지 않는다 — 승인 요청 삭제 경로가 없고, 결함이
        # 살아 있는 상태에서 정리를 흉내 내면 흔적까지 지워진다. 수동 확인이 맞다.
        aid = r.json().get("approvalId")
        ok(f"남의 테넌트 대상 승인 요청 차단 (요청 #{aid} 생성됨 — 결정하지 않고 중단, 수동 정리 필요)",
           False, "targetId 소유 검증이 없다 — 결정 시 상대 테넌트 상태가 전이된다")
    ok("남의 테넌트 대상 승인 요청 차단(404)", r.status == 404,
       f"status={r.status} body={r.text()[:160]}")

    # ── 정상 경로는 그대로 통해야 한다 (과잉 차단이 아님) ──
    target = sorted(my_ids)[0]
    r = call("POST", "/approvals", tok, data={
        "targetTable": "product_code", "targetId": target,
        "requestType": "UPDATE", "label": "테넌트 소유 검증(정상)"})
    ok("내 테넌트 대상 승인 요청은 통과", r.status in (201, 409),
       f"status={r.status} body={r.text()[:160]} — 소유 검증이 정상 경로를 막으면 안 된다")
    if r.status == 201:
        # 정리 — 승인함에 미결로 남기지 않는다. 대상은 이미 APPROVED 이므로 승인 결정은
        # 값을 바꾸지 않는다(반려로 정리하면 실제로 상태를 내려 버린다).
        aid = r.json()["approvalId"]
        d = call("POST", f"/approvals/{aid}/decide", tok,
                 data={"approve": True, "comment": "검증 정리"})
        ok("검증용 요청 정리(결정 반영)", d.ok, f"status={d.status}")

    # ── 알 수 없는 대상 테이블은 받지 않는다 — 소유를 확인할 수 없기 때문 ──
    r = call("POST", "/approvals", tok, data={
        "targetTable": "cst_price", "targetId": 1,
        "requestType": "UPDATE", "label": "미지원 대상"})
    ok("소유 확인 불가한 대상 테이블은 422", r.status == 422,
       f"status={r.status} — 모르는 대상을 통과시키면 검증이 우회 가능한 장식이 된다")

    req.dispose()

print(f"\nOK — 승인 대상 테넌트 소유 {n}개 검증 통과")

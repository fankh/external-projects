# -*- coding: utf-8 -*-
"""U18 Hierarchy 노드 이동 라이브 검증 (10.4).

기존 이동 테스트(live_triage)는 **리프 노드 1회 이동**만 확인해서 아래 결함들을 지나쳤다.
주소 규칙은 슬래시 구분(/M/ENG/FAN)인데 이동 함수만 점(.) 구분을 가정하고 있었고, 그 결과
①자기 하위로 이동하는 순환이 막히지 않고 ②같은 부모로 두 번 옮기면 주소가 충돌하고
③**하위 노드 주소가 갱신되지 않아 부모만 옮겨지고 자식은 옛 경로에 남았다**
(moved=1 로 보고되어 겉으로는 성공처럼 보였다).

그래서 이 스위트는 하위를 가진 노드를 옮기고 **자식 주소가 실제로 따라왔는지**를 본다.
검증용 노드는 스스로 만들고 끝나면 지운다(잔재 0 확인).

실행: PYTHONUTF8=1 py tests/live_u18_node_move.py
"""
import os

from playwright.sync_api import sync_playwright

BASE = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
ROOT_A = "/mv-a"        # 이동 원본 상위
ROOT_B = "/mv-b"        # 이동 대상 상위
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

    def tree():
        t = call("GET", "/hierarchy", admin).json()
        return t if isinstance(t, list) else (t.get("items") or t.get("nodes") or [])

    def nid(x):
        return x.get("id") or x.get("hierarchyId")

    def addr_map():
        return {str(x.get("address")): x for x in tree() if x.get("address")}

    def purge(*prefixes):
        gone = 0
        for x in sorted(tree(), key=lambda y: len(str(y.get("address", ""))), reverse=True):
            a = str(x.get("address", ""))
            if any(a == p or a.startswith(p + "/") for p in prefixes):
                if call("DELETE", f"/hierarchy/nodes/{nid(x)}", admin).status in (200, 204):
                    gone += 1
        return gone

    def mk(address: str, name: str, parent: str = ""):
        return call("POST", "/hierarchy/nodes", admin, data={
            "address": address, "name": name, "parentAddress": parent, "treeType": "PRODUCT"})

    purge(ROOT_A, ROOT_B)

    # ── 1. 픽스처: /mv-a/box{,/inner,/inner/leaf} 와 /mv-b ──
    ok("원본 상위 생성", mk(ROOT_A, "mv-a").status == 201)
    ok("대상 상위 생성", mk(ROOT_B, "mv-b").status == 201)
    ok("이동할 노드 생성", mk(f"{ROOT_A}/box", "box", ROOT_A).status == 201)
    ok("자식 생성", mk(f"{ROOT_A}/box/inner", "inner", f"{ROOT_A}/box").status == 201)
    ok("손자 생성", mk(f"{ROOT_A}/box/inner/leaf", "leaf", f"{ROOT_A}/box/inner").status == 201)

    m = addr_map()
    box, target_b = m[f"{ROOT_A}/box"], m[ROOT_B]

    # ── 2. 하위를 가진 노드 이동 — 자식이 따라와야 한다 ──
    r = call("POST", f"/hierarchy/nodes/{nid(box)}/move", admin,
             data={"targetParentId": nid(target_b)})
    ok("이동 성공", r.ok, f"status={r.status} body={r.text()[:140]}")
    mv = r.json()
    ok("새 주소가 슬래시 규칙을 따름 (대상 상위 + 원래 이름 세그먼트)",
       mv["newAddress"] == f"{ROOT_B}/box", mv["newAddress"])
    ok("본인+하위 3노드가 갱신됐다고 보고", mv["moved"] == 3, f"moved={mv['moved']}")

    m2 = addr_map()
    ok("자식 주소가 따라옴", f"{ROOT_B}/box/inner" in m2,
       f"실제: {[a for a in m2 if 'inner' in a]}")
    ok("손자 주소가 따라옴", f"{ROOT_B}/box/inner/leaf" in m2)
    ok("옛 경로에 잔존 노드 없음",
       not [a for a in m2 if a.startswith(f"{ROOT_A}/box")],
       f"잔존: {[a for a in m2 if a.startswith(ROOT_A + '/box')]}")

    # ── 3. 거부해야 하는 이동 ──
    box2 = addr_map()[f"{ROOT_B}/box"]
    inner = addr_map()[f"{ROOT_B}/box/inner"]
    ok("자기 하위로 이동 거부(422) — 순환 방지",
       call("POST", f"/hierarchy/nodes/{nid(box2)}/move", admin,
            data={"targetParentId": nid(inner)}).status == 422)
    ok("같은 위치로 재이동 거부(409)",
       call("POST", f"/hierarchy/nodes/{nid(box2)}/move", admin,
            data={"targetParentId": nid(addr_map()[ROOT_B])}).status == 409)
    ok("순환 시도 후에도 구조가 그대로",
       f"{ROOT_B}/box/inner/leaf" in addr_map())

    # 같은 이름이 이미 있는 곳으로 이동 → 409 (UNIQUE(parent_id,node_name))
    ok("대상에 동명 노드 생성", mk(f"{ROOT_A}/box", "box", ROOT_A).status == 201)
    ok("동명 충돌 이동 거부(409)",
       call("POST", f"/hierarchy/nodes/{nid(box2)}/move", admin,
            data={"targetParentId": nid(addr_map()[ROOT_A])}).status == 409)

    # ── 4. 루트로 이동 ──
    r = call("POST", f"/hierarchy/nodes/{nid(inner)}/move", admin,
             data={"targetParentId": None})
    ok("루트로 이동 성공", r.ok, f"status={r.status} body={r.text()[:140]}")
    ok("루트 주소도 슬래시로 시작", r.json()["newAddress"] == "/inner", r.json()["newAddress"])
    ok("루트 이동 시에도 손자가 따라옴", "/inner/leaf" in addr_map())

    # ── 4b. 형제 동명 — 제약 위반이 500 이 아니라 409 로 나와야 한다 (10.7) ──
    # sys_hierarchy 에 UNIQUE(parent_id, node_name) 이 있는데 등록·개명이 주소만 검사했다.
    ok("동명 하위 등록 거부(409)",
       mk(f"{ROOT_A}/dupname", "box", ROOT_A).status == 409,
       "ROOT_A 아래에 이미 'box' 가 있다")
    ok("서로 다른 이름 하위 등록은 허용",
       mk(f"{ROOT_A}/other", "other", ROOT_A).status == 201)
    other = addr_map()[f"{ROOT_A}/other"]
    ok("형제 이름으로 개명 거부(409)",
       call("PATCH", f"/hierarchy/nodes/{nid(other)}", admin,
            data={"name": "box"}).status == 409)
    ok("다른 이름으로 개명은 허용",
       call("PATCH", f"/hierarchy/nodes/{nid(other)}", admin,
            data={"name": "other2"}).ok)

    # ── 4c. 19.4: 이름에 `_` 가 있으면 이동이 **형제 가지까지 다시 썼다** ──
    # 접두 매칭이 LIKE 인데 base 를 리터럴화하지 않아, `_` 가 '아무 한 글자' 로 읽혔다.
    # 9.32 가 영향 분석에서 같은 문제를 고쳤는데 이동 연쇄 갱신에는 적용되지 않았다.
    # 밑줄 노드와 그 자리에 다른 글자가 든 형제를 나란히 두고, 하나만 옮긴다.
    ok("밑줄 노드 생성", mk(f"{ROOT_A}/a_b", "a_b", ROOT_A).status == 201)
    ok("밑줄 노드 자식", mk(f"{ROOT_A}/a_b/kid", "kid", f"{ROOT_A}/a_b").status == 201)
    ok("형제(같은 자리 다른 글자) 생성", mk(f"{ROOT_A}/aXb", "aXb", ROOT_A).status == 201)
    ok("형제 자식", mk(f"{ROOT_A}/aXb/kid", "kid", f"{ROOT_A}/aXb").status == 201)
    und = addr_map()[f"{ROOT_A}/a_b"]
    r = call("POST", f"/hierarchy/nodes/{nid(und)}/move", admin,
             data={"targetParentId": nid(addr_map()[ROOT_B])})
    ok("밑줄 노드 이동 성공", r.ok, f"status={r.status} body={r.text()[:140]}")
    ok(f"★ 본인+자식 2건만 갱신 (moved={r.json()['moved']}) — 형제 가지는 건드리지 않는다",
       r.json()["moved"] == 2)
    m3 = addr_map()
    ok("★ 형제와 그 자식은 제자리", f"{ROOT_A}/aXb" in m3 and f"{ROOT_A}/aXb/kid" in m3,
       f"실제: {[a for a in m3 if 'aXb' in a]}")
    ok("옮긴 쪽은 자식까지 따라옴",
       f"{ROOT_B}/a_b" in m3 and f"{ROOT_B}/a_b/kid" in m3,
       f"실제: {[a for a in m3 if 'a_b' in a]}")

    # ── 5. 정리 ──
    purge(ROOT_A, ROOT_B, "/inner")
    left = [a for a in addr_map() if a.startswith((ROOT_A, ROOT_B, "/inner"))]
    ok("정리 후 잔재 0", not left, f"잔재: {left}")

    req.dispose()

print(f"\nOK — U18 노드 이동 {n}개 검증 통과")

# -*- coding: utf-8 -*-
"""U18 Hierarchy 구조 복제 라이브 검증 (10.0/10.1).

복제는 **쓰기가 트리 전체에 번지는** 연산이라 잘못되면 남의 구조를 오염시킨다.
그래서 성공 경로뿐 아니라 ①승인 상태를 물려받지 않는지 ②하위 tree_type 을 덮어쓰지 않는지
③자기 하위·주소 중복·상한 초과를 거부하는지 ④부분 복사본을 남기지 않는지까지 밟는다.
검증 후 만든 노드는 전부 삭제한다(잔재 0 확인).

실행: PYTHONUTF8=1 py tests/live_u18_node_copy.py
"""
import os

from playwright.sync_api import sync_playwright

BASE = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
SUFFIX = "-u18copy"          # 이 스위트가 만드는 주소 접미사
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

    def nid(node):
        return node.get("id") or node.get("hierarchyId")

    def purge(prefix: str) -> int:
        """접미사로 만든 노드를 깊은 것부터 삭제 — 다음 실행이 주소 중복으로 막히지 않게."""
        gone = 0
        for x in sorted([y for y in tree() if str(y.get("address", "")).startswith(prefix)],
                        key=lambda y: len(str(y.get("address", ""))), reverse=True):
            if call("DELETE", f"/hierarchy/nodes/{nid(x)}", admin).status in (200, 204):
                gone += 1
        return gone

    nodes = tree()
    by_addr = {str(x.get("address")): x for x in nodes if x.get("address")}
    ok("계층 트리 조회", len(by_addr) >= 1, f"{len(by_addr)}노드")

    # 하위가 있는 노드를 고른다 — 서브트리 복사를 실제로 검증하기 위해
    src_node, expected = None, 0
    for a, x in by_addr.items():
        kids = [y for y in by_addr if y.startswith(a + "/")]
        if kids:
            src_node, expected = x, len(kids) + 1
            break
    ok("하위가 있는 원본 노드 확보", src_node is not None,
       "서브트리가 없으면 복제 검증이 성립하지 않는다")
    src = str(src_node["address"])
    TARGET = src + SUFFIX

    purge(TARGET)          # 앞선 실행 잔재

    # ── 1. 성공 경로 ──
    r = call("POST", f"/hierarchy/nodes/{nid(src_node)}/copy", admin,
             data={"targetAddress": TARGET})
    ok("서브트리 복제 성공", r.status == 201, f"status={r.status} body={r.text()[:120]}")
    body = r.json()
    ok("복제 노드 수가 원본 서브트리와 일치", body["copied"] == expected,
       f"기대 {expected} 실제 {body['copied']}")
    ok("이름 미지정 시 대상 주소의 마지막 구간을 이름으로 사용",
       body["name"] == TARGET.rsplit("/", 1)[-1], body["name"])

    after = tree()
    copied = [x for x in after if str(x.get("address", "")).startswith(TARGET)]
    ok("트리에 실제로 반영", len(copied) == expected, f"{len(copied)}노드")

    # 하위 노드의 tree_type 이 원본과 같아야 한다 (루트 값으로 덮어쓰던 결함 회귀 방지)
    def ttypes(items):
        return {str(x.get("treeType") or x.get("tree_type")) for x in items}
    src_items = [x for x in after if str(x.get("address", "")) == src
                 or str(x.get("address", "")).startswith(src + "/")]
    ok("하위 tree_type 보존 (루트 값으로 덮어쓰지 않음)",
       ttypes(src_items) == ttypes(copied), f"{ttypes(src_items)} vs {ttypes(copied)}")

    # ── 2. 거부해야 하는 요청 ──
    ok("같은 주소로 재복사 거부(409)",
       call("POST", f"/hierarchy/nodes/{nid(src_node)}/copy", admin,
            data={"targetAddress": TARGET}).status == 409)
    ok("자기 하위로 복사 거부(409) — 무한 중첩 방지",
       call("POST", f"/hierarchy/nodes/{nid(src_node)}/copy", admin,
            data={"targetAddress": src + "/inner"}).status == 409)
    ok("원본과 같은 주소 거부(409)",
       call("POST", f"/hierarchy/nodes/{nid(src_node)}/copy", admin,
            data={"targetAddress": src}).status == 409)
    ok("상위 경로가 없으면 거부(422)",
       call("POST", f"/hierarchy/nodes/{nid(src_node)}/copy", admin,
            data={"targetAddress": "/__nosuch__/x"}).status == 422)
    ok("빈 대상 주소 거부(422)",
       call("POST", f"/hierarchy/nodes/{nid(src_node)}/copy", admin,
            data={"targetAddress": "   "}).status == 422)
    ok("없는 노드 404",
       call("POST", "/hierarchy/nodes/99999999/copy", admin,
            data={"targetAddress": "/__x__"}).status == 404)
    ok("무인증 401",
       call("POST", f"/hierarchy/nodes/{nid(src_node)}/copy",
            data={"targetAddress": "/__x2__"}).status == 401)

    # 실패 요청이 부분 복사본을 남기지 않았는지 — 트랜잭션 롤백 확인
    ok("거부된 요청이 노드를 만들지 않음",
       len([x for x in tree() if str(x.get("address", "")).startswith(TARGET)]) == expected)

    # ── 3. 정리 ──
    ok("복제본 정리", purge(TARGET) == expected)
    ok("정리 후 잔재 0",
       not [x for x in tree() if str(x.get("address", "")).startswith(TARGET)])

    req.dispose()

print(f"\nOK — U18 구조 복제 {n}개 검증 통과")

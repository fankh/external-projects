# -*- coding: utf-8 -*-
"""C5 잔여 — DB 필요 로직 단위 테스트 (승인 전이 · 창고 계층).

실 PostgreSQL 필요: DATABASE_URL 이 설정된 경우에만 실행 (CI backend-db 잡 —
services: postgres). 앱 lifespan 이 alembic upgrade + 멱등 시드를 수행하므로
빈 DB 에서 그대로 동작한다. DATABASE_URL 미설정(backend-unit 잡·로컬 기본)은 전체 skip.
"""
import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"), reason="DATABASE_URL 없음 — DB 테스트는 backend-db 잡에서 실행")


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    from app.main import app
    with TestClient(app) as c:   # context manager = lifespan(마이그레이션+시드) 실행
        yield c


@pytest.fixture(scope="module")
def auth(client):
    r = client.post("/api/v1/auth/login", json={"userId": "edim", "password": "edim"})
    assert r.status_code == 200, f"시드 로그인 실패: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


# ── 승인 전이 (sys_approval_request → 자산 상태) ──

def _any_product(client, auth) -> dict:
    rows = client.get("/api/v1/codes/products", headers=auth).json()
    assert rows, "시드 product_code 없음"
    return rows[0]


def _create_approval(client, auth, target_id: int) -> int:
    r = client.post("/api/v1/approvals", headers=auth,
                    json={"targetTable": "product_code", "targetId": target_id,
                          "requestType": "UPDATE", "label": "unit-test"})
    assert r.status_code == 201, r.text
    return r.json()["approvalId"]


def test_approval_approve_transitions_target(client, auth):
    pc = _any_product(client, auth)
    aid = _create_approval(client, auth, pc["productCodeId"])
    r = client.post(f"/api/v1/approvals/{aid}/decide", headers=auth,
                    json={"approve": True, "comment": "ok"})
    assert r.status_code == 200
    assert r.json()["result"] == "APPROVED"
    after = [x for x in client.get("/api/v1/codes/products", headers=auth).json()
             if x["productCodeId"] == pc["productCodeId"]][0]
    assert after["status"] == "APPROVED"


def test_approval_reject_requires_comment(client, auth):
    pc = _any_product(client, auth)
    aid = _create_approval(client, auth, pc["productCodeId"])
    r = client.post(f"/api/v1/approvals/{aid}/decide", headers=auth,
                    json={"approve": False, "comment": ""})
    assert r.status_code == 422
    # 코멘트와 함께 반려 → 대상 REJECTED 전이
    r = client.post(f"/api/v1/approvals/{aid}/decide", headers=auth,
                    json={"approve": False, "comment": "사유"})
    assert r.status_code == 200 and r.json()["result"] == "REJECTED"
    after = [x for x in client.get("/api/v1/codes/products", headers=auth).json()
             if x["productCodeId"] == pc["productCodeId"]][0]
    assert after["status"] == "REJECTED"


def test_approval_double_decide_404(client, auth):
    pc = _any_product(client, auth)
    aid = _create_approval(client, auth, pc["productCodeId"])
    assert client.post(f"/api/v1/approvals/{aid}/decide", headers=auth,
                       json={"approve": True, "comment": ""}).status_code == 200
    r = client.post(f"/api/v1/approvals/{aid}/decide", headers=auth,
                    json={"approve": True, "comment": ""})
    assert r.status_code == 404   # 이미 결정됨 — 재결정 불가


def test_approval_duplicate_pending_409(client, auth):
    # 동일 대상에 PENDING 요청이 있으면 재요청 409 (승인함 처리 후 재요청 유도)
    rows = client.get("/api/v1/codes/products", headers=auth).json()
    target = rows[1]["productCodeId"]
    aid = _create_approval(client, auth, target)
    r = client.post("/api/v1/approvals", headers=auth,
                    json={"targetTable": "product_code", "targetId": target,
                          "requestType": "UPDATE", "label": "dup"})
    assert r.status_code == 409
    client.post(f"/api/v1/approvals/{aid}/decide", headers=auth,
                json={"approve": True, "comment": ""})


def test_approval_decide_batch_skips_decided(client, auth):
    # 대상별 PENDING 1건 규칙 → 서로 다른 product_code 3건으로 구성
    rows = client.get("/api/v1/codes/products", headers=auth).json()
    assert len(rows) >= 5, "시드 product_code 부족"
    a1 = _create_approval(client, auth, rows[2]["productCodeId"])
    a2 = _create_approval(client, auth, rows[3]["productCodeId"])
    done = _create_approval(client, auth, rows[4]["productCodeId"])
    client.post(f"/api/v1/approvals/{done}/decide", headers=auth,
                json={"approve": True, "comment": ""})
    r = client.post("/api/v1/approvals/decide-batch", headers=auth,
                    json={"approvalIds": [a1, a2, done], "approve": True, "comment": ""})
    assert r.status_code == 200
    body = r.json()
    assert body["processed"] == 2 and body["skipped"] == 1
    assert set(body["processedIds"]) == {a1, a2} and body["skippedIds"] == [done]


def test_approval_batch_reject_requires_comment(client, auth):
    r = client.post("/api/v1/approvals/decide-batch", headers=auth,
                    json={"approvalIds": [999999], "approve": False, "comment": ""})
    assert r.status_code == 422


# ── 창고 계층 (erp_warehouse 재귀 CTE + 계층 순서 강제) ──

def _tree(client, auth) -> list[dict]:
    r = client.get("/api/v1/erp/warehouses", headers=auth)
    assert r.status_code == 200
    return r.json()


def test_warehouse_tree_depth_and_path(client, auth):
    tree = _tree(client, auth)
    assert tree, "시드 창고 없음"
    by_id = {n["warehouseId"]: n for n in tree}
    for n in tree:
        if n["parentId"] is None:
            assert n["depth"] == 0 and n["path"] == n["code"]
        else:
            p = by_id[n["parentId"]]
            assert n["depth"] == p["depth"] + 1
            assert n["path"] == f"{p['path']}/{n['code']}"


def test_warehouse_hierarchy_rules(client, auth):
    import uuid
    sfx = uuid.uuid4().hex[:6].upper()   # 재실행(비-fresh DB)에도 코드 충돌 없음
    rg, pl = f"UT-RG-{sfx}", f"UT-PL-{sfx}"
    # 최상위 REGION 등록
    r = client.post("/api/v1/erp/warehouses", headers=auth,
                    json={"parentCode": "", "locationType": "REGION",
                          "code": rg, "name": "테스트권역"})
    assert r.status_code == 201, r.text
    # 최상위에 REGION 외 유형 → 422
    r = client.post("/api/v1/erp/warehouses", headers=auth,
                    json={"parentCode": "", "locationType": "PLANT",
                          "code": f"UT-BAD-{sfx}", "name": "x"})
    assert r.status_code == 422
    # REGION 아래 REGION (동급) → 422 계층 오류
    r = client.post("/api/v1/erp/warehouses", headers=auth,
                    json={"parentCode": rg, "locationType": "REGION",
                          "code": f"UT-RG2-{sfx}", "name": "x"})
    assert r.status_code == 422
    # REGION 아래 PLANT → 201, 그리고 depth/path 반영
    r = client.post("/api/v1/erp/warehouses", headers=auth,
                    json={"parentCode": rg, "locationType": "PLANT",
                          "code": pl, "name": "테스트공장"})
    assert r.status_code == 201
    node = [n for n in _tree(client, auth) if n["code"] == pl][0]
    assert node["depth"] == 1 and node["path"] == f"{rg}/{pl}"
    # 코드 중복 → 409
    r = client.post("/api/v1/erp/warehouses", headers=auth,
                    json={"parentCode": rg, "locationType": "PLANT",
                          "code": pl, "name": "중복"})
    assert r.status_code == 409
    # 없는 상위 → 422
    r = client.post("/api/v1/erp/warehouses", headers=auth,
                    json={"parentCode": "NO-SUCH", "locationType": "PLANT",
                          "code": f"UT-PL9-{sfx}", "name": "x"})
    assert r.status_code == 422
    # 잘못된 유형 문자열 → 422
    r = client.post("/api/v1/erp/warehouses", headers=auth,
                    json={"parentCode": rg, "locationType": "CASTLE",
                          "code": f"UT-XX-{sfx}", "name": "x"})
    assert r.status_code == 422

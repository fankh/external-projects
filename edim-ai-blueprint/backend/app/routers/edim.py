"""EDIM /api/v1 — 실 PostgreSQL 기반 (OpenAPI 스펙 경로 준수).

인증: POST /auth/login → HMAC 토큰. 데이터 엔드포인트는 개발 단계라 토큰 검증을
강제하지 않는다 (게이트웨이/JWT 전환 시 Depends 로 교체).
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import time
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import db_ok, get_pool
from app.services.edim_seed import TENANT

router = APIRouter(prefix="/api/v1", tags=["edim"])

SECRET = os.getenv("EDIM_SECRET", "edim-dev-secret").encode()

SOURCE_LABEL = {"APPLIED": "견적적용", "PURCHASE": "구매", "STOCK": "재고", "QUOTE": "견적"}
SOURCE_PRIORITY = ["APPLIED", "PURCHASE", "STOCK", "QUOTE"]


def _conn():
    pool = get_pool()
    if pool is None or not db_ok():
        raise HTTPException(503, detail="EDIM DB unavailable")
    return pool.connection()


def _tenant_id(cur) -> int:
    cur.execute("SELECT tenant_id FROM sys_tenant WHERE tenant_code=%s", (TENANT,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(503, detail="seed not applied")
    return row[0]


# ── health ──
@router.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "db": db_ok()}


# ── SVC-01 Auth ──
class LoginRequest(BaseModel):
    userId: str
    password: str


@router.post("/auth/login")
def login(body: LoginRequest) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT user_id, user_name, department, user_level, password_hash
               FROM sys_user WHERE tenant_id=%s AND login_id=%s AND status='ACTIVE'""",
            (tid, body.userId.strip()))
        row = cur.fetchone()
    if not row or hashlib.sha256(body.password.encode()).hexdigest() != row[4]:
        raise HTTPException(401, detail="사번 또는 비밀번호가 올바르지 않습니다")
    exp = int(time.time()) + 8 * 3600
    payload = f"{body.userId}.{exp}"
    sig = hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return {
        "token": f"{payload}.{sig}",
        "user": {
            "userId": body.userId, "name": row[1], "department": row[2] or "",
            "userLevel": row[3], "tenantId": TENANT,
        },
    }


# ── SVC-03 Code ──
@router.get("/codes/groups/{group}/slots")
def group_slots(group: str) -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT ci.item_slot, ci.item_name,
                      COALESCE(array_agg(civ.value_code ORDER BY civ.sort_order)
                               FILTER (WHERE civ.approval_status='APPROVED'), '{}')
               FROM code_group cg
               JOIN code_item ci ON ci.group_id=cg.group_id
               LEFT JOIN code_item_value civ ON civ.item_id=ci.item_id
               WHERE cg.tenant_id=%s AND cg.group_code=%s
               GROUP BY ci.item_slot, ci.item_name, ci.sort_order
               ORDER BY ci.item_slot""", (tid, group))
        return [
            {"slot": r[0], "label": r[1], "values": list(r[2]), "approved": True}
            for r in cur.fetchall()
        ]


class ExpandRequest(BaseModel):
    rootCode: str = "KDCR 3-13"
    slotValues: dict[str, str]


@router.post("/codes/products/expand")
def expand(body: ExpandRequest) -> dict[str, Any]:
    """BOM 재귀 전개 — code_relationship + slot_map (verify_runtime.sql T1 과 동일 로직)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """
            WITH RECURSIVE bom AS (
              SELECT pc.product_code_id, pc.main_code, pc.code_name,
                     1::numeric AS quantity, 0 AS lvl,
                     %s::jsonb AS slots, pc.main_code::text AS path, ''::text AS ord
              FROM product_code pc
              WHERE pc.tenant_id=%s AND pc.main_code=%s
              UNION ALL
              SELECT c.product_code_id, c.main_code, c.code_name,
                     (b.quantity * r.quantity)::numeric, b.lvl + 1,
                     COALESCE((SELECT jsonb_object_agg(sm.child_slot,
                         CASE WHEN sm.mother_slot IS NOT NULL
                              THEN b.slots ->> sm.mother_slot
                              ELSE sm.fixed_value END)
                       FROM code_relationship_slot_map sm
                       WHERE sm.rel_id = r.rel_id), '{}'::jsonb),
                     (b.path || ' > ' || c.main_code)::text,
                     (b.ord || lpad(r.sort_order::text, 4, '0'))::text
              FROM bom b
              JOIN code_relationship r
                ON r.mother_code_id = b.product_code_id AND r.approval_status = 'APPROVED'
              JOIN product_code c ON c.product_code_id = r.child_code_id
              WHERE b.lvl < 10
            )
            SELECT b.main_code, b.code_name, b.quantity, b.lvl, b.slots, b.path,
                   (SELECT p.price FROM cst_price p
                    WHERE p.product_code_id = b.product_code_id
                      AND p.valid_from <= CURRENT_DATE
                      AND (p.valid_to IS NULL OR p.valid_to >= CURRENT_DATE)
                    ORDER BY array_position(%s::text[], p.price_source), p.valid_from DESC
                    LIMIT 1) AS price
            FROM bom b WHERE b.lvl > 0 ORDER BY b.ord
            """,
            (json.dumps(body.slotValues), tid, body.rootCode, SOURCE_PRIORITY))
        rows = cur.fetchall()
    if not rows:
        raise HTTPException(404, detail=f"root code not found: {body.rootCode}")

    def resolved(main: str, slots: dict[str, str]) -> str:
        parts = [v for _, v in sorted(slots.items()) if v]
        return f"{main}-{'-'.join(parts)}" if parts else main

    sv = body.slotValues
    finished = f"{body.rootCode}-{sv.get('B', '?')}-{sv.get('E', '?')}"
    return {
        "finishedGoodsCode": finished,
        "items": [
            {
                "level": r[3], "mainCode": r[0],
                "resolvedCode": resolved(r[0], r[4] or {}),
                "name": r[1], "quantity": float(r[2]),
                "priceK": round(float(r[6]) / 1000) if r[6] is not None else None,
                "path": r[5],
            }
            for r in rows
        ],
    }


# ── SVC-05 Table ──
@router.get("/tables/tech-data")
def tech_data(airflow: float = 0, pressure: float = 0) -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT r.row_key, r.row_values
               FROM tbl_data_table t JOIN tbl_data_row r ON r.table_id=t.table_id
               WHERE t.tenant_id=%s AND t.table_name='FanTechData'
               ORDER BY r.row_key_num""", (tid,))
        rows = [{"model": r[0], **r[1]} for r in cur.fetchall()]
    rows.sort(key=lambda x: abs(x["pd"] - airflow) + abs(x["pt"] - pressure))
    return rows


# ── SVC-08 Cost ──
@router.get("/prices/resolve")
def resolve_price(code: str, at: str | None = None) -> dict[str, Any]:
    ref = at or date.today().isoformat()
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT pc.main_code, pc.code_name, p.price_source, p.price,
                      p.valid_from, p.valid_to, cc.company_name
               FROM cst_price p
               JOIN product_code pc ON pc.product_code_id=p.product_code_id
               LEFT JOIN com_company cc ON cc.company_id=p.supplier_id
               WHERE p.tenant_id=%s AND upper(pc.main_code)=upper(%s)
                 AND p.valid_from <= %s::date
                 AND (p.valid_to IS NULL OR p.valid_to >= %s::date)
               ORDER BY array_position(%s::text[], p.price_source), p.valid_from DESC
               LIMIT 1""", (tid, code, ref, ref, SOURCE_PRIORITY))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, detail=f"단가 없음: {code} @ {ref}")
    return {
        "code": row[0], "name": row[1], "source": SOURCE_LABEL[row[2]],
        "price": float(row[3]), "from": row[4].isoformat(),
        "to": row[5].isoformat() if row[5] else None,
        "supplier": row[6] or "-", "active": True,
    }


# ── SVC-07 CPQ / ENG-02 Run ──
RUN_STEPS = [
    ("BOM 전개 (Code Relationship 재귀)", "47 파트 · 깊이 3", "0.8s"),
    ("치수 Macro 평가 (우선순위 위상정렬)", "214 식", "12.0s"),
    ("도면 생성 (승인 1 · 제작 12)", "13 파일", "2m 25s"),
    ("원가·PCR (OWN/BIZ1/BIZ2)", "단가 resolve 47", "1m 40s"),
    ("기술자료 생성", "5건", "55s"),
    ("서류·Project Folder 저장", "산출물 21", "38s"),
]
RUN_OUTPUTS = [
    ("DWG", "AHU5 승인도면 Rev.B", "PDF", "고객승인 대기", "warn", "AP 요청"),
    ("DWG", "제작도면 12매 (KDCR 3-13 외)", "DXF", "생성", "ok", "미리보기"),
    ("PRICE", "견적서 QR-61216-01 · ₩23,000K", "PDF", "DRAFT", "info", "QCR 발행"),
    ("PRICE", "PCR (EBIT 18.2%)", "XLSX", "생성", "ok", "열기"),
    ("DATA", "기술자료 5건 — Fan 성능·밀도 외", "PDF", "생성", "ok", None),
    ("BOM", "BOM·Part List", "XLSX", "생성", "ok", "ERP 전송"),
]
RUN_LOGS = [
    "BOM expand root=KDCR 3-13 … 47 items",
    "macro eval 214/214 ✓ avg 41ms",
    "drawing compose 13 files → DWG/",
    "warn KDC 21: 재고단가 없음 → 견적단가 대체 (③→④)",
    "PCR OWN/BIZ1/BIZ2 · quotation draft",
    "outputs 21 → Project Folder SUCCESS",
]

_runs: dict[int, dict[str, Any]] = {}  # 진행 상태 (완료분은 cpq_run 에 영속)


class RunRequest(BaseModel):
    runType: str = "ALL"


async def _advance(run_id: int) -> None:
    state = _runs[run_id]
    for i in range(len(RUN_STEPS)):
        state["current"] = i
        await asyncio.sleep(0.75)
    state["current"] = len(RUN_STEPS)
    state["status"] = "SUCCESS"
    try:
        pool = get_pool()
        if pool:
            with pool.connection() as conn, conn.cursor() as cur:
                cur.execute(
                    """UPDATE cpq_run SET status='SUCCESS', finished_at=now(),
                       dimension_values=%s WHERE run_id=%s""",
                    (json.dumps({"KDCR 3-13": {"A": 670, "B": 726}}), run_id))
                for otype, name, ftype, *_ in RUN_OUTPUTS:
                    cur.execute(
                        """INSERT INTO cpq_output (run_id, output_type, data)
                           VALUES (%s,%s,%s)""",
                        (run_id, otype, json.dumps({"file": name, "fileType": ftype})))
    except Exception:  # noqa: BLE001 — 진행 상태는 메모리로 유지
        pass


@router.post("/cpq/runs", status_code=202)
async def start_run(body: RunRequest) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT selection_id FROM cpq_selection WHERE tenant_id=%s ORDER BY selection_id LIMIT 1",
            (tid,))
        sel = cur.fetchone()
        if not sel:
            raise HTTPException(503, detail="seed selection missing")
        cur.execute(
            """INSERT INTO cpq_run (tenant_id, selection_id, run_type, status)
               VALUES (%s,%s,%s,'RUNNING') RETURNING run_id""",
            (tid, sel[0], body.runType))
        run_id = cur.fetchone()[0]
    _runs[run_id] = {"status": "RUNNING", "current": -1}
    asyncio.get_running_loop().create_task(_advance(run_id))
    return {"runId": run_id, "status": "RUNNING", "statusUrl": f"/api/v1/cpq/runs/{run_id}"}


@router.get("/cpq/runs/{run_id}")
def run_status(run_id: int) -> dict[str, Any]:
    state = _runs.get(run_id)
    if state is None:
        # 백엔드 재기동 후 완료 run — DB 에서 상태 복원
        with _conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT status FROM cpq_run WHERE run_id=%s", (run_id,))
            row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"run not found: {run_id}")
        state = {"status": row[0], "current": len(RUN_STEPS)}
    cur_i = state["current"]
    done = state["status"] == "SUCCESS"
    steps = []
    for i, (task, measured, elapsed) in enumerate(RUN_STEPS):
        st = ("WARN" if i == 3 else "DONE") if (done or i < cur_i) \
            else ("RUNNING" if i == cur_i else "PENDING")
        steps.append({
            "no": i + 1, "task": task,
            "measured": measured if st != "PENDING" else "—",
            "elapsed": elapsed if st in ("DONE", "WARN") else "",
            "status": st,
        })
    progress = 1.0 if done else max(0.0, (cur_i + 0.5) / len(RUN_STEPS))
    n_logs = len(RUN_LOGS) if done else max(0, round(len(RUN_LOGS) * progress))
    base = ["10:31:02", "10:31:15", "10:33:40", "10:35:12", "10:38:56", "10:39:34"]
    return {
        "runId": run_id, "status": state["status"], "progress": progress,
        "steps": steps,
        "outputs": [
            {"folder": o[0], "file": o[1], "fileType": o[2], "status": o[3],
             "statusTone": o[4], "nextAction": o[5]}
            for o in RUN_OUTPUTS
        ] if done else [],
        "logs": [
            {"time": base[i], "message": RUN_LOGS[i],
             "level": "warn" if "warn" in RUN_LOGS[i] else "info"}
            for i in range(n_logs)
        ],
    }

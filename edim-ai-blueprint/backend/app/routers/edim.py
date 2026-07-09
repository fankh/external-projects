"""EDIM /api/v1 — 실 PostgreSQL 기반 (OpenAPI 스펙 경로 준수).

인증: POST /auth/login → HMAC 토큰. 데이터 엔드포인트는 개발 단계라 토큰 검증을
강제하지 않는다 (게이트웨이/JWT 전환 시 Depends 로 교체).
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import io
import json
import os
import time
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi import Depends, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.db import db_ok, get_pool
from app.services import storage
from app.services.edim_seed import TENANT
from app.services.macro_engine import Evaluator, MacroError

SECRET = os.getenv("EDIM_SECRET", "edim-dev-secret").encode()

# 공개 경로 — 그 외 전부 Bearer 토큰 필수 (P0-1)
PUBLIC_SUFFIXES = ("/health", "/auth/login")


LEVEL_RANK = {"GENERAL": 0, "SETUP": 1, "ADMIN": 2, "PLATFORM": 3}


def require_auth(request: Request) -> None:
    # /i18n/{locale} 는 로그인 화면에서도 필요 — 공개
    if request.url.path.endswith(PUBLIC_SUFFIXES) or "/i18n/" in request.url.path:
        return
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, detail="인증 필요 — 로그인 토큰이 없습니다")
    parts = auth[7:].rsplit(".", 2)   # login 에 '.' 포함 가능 (park.f)
    if len(parts) != 3:
        raise HTTPException(401, detail="토큰 형식 오류")
    login, exp, sig = parts
    expected = hmac.new(SECRET, f"{login}.{exp}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(401, detail="토큰 서명 불일치")
    if not exp.isdigit() or int(exp) < time.time():
        raise HTTPException(401, detail="토큰 만료 — 다시 로그인하십시오")
    # 사용자 컨텍스트 (RBAC·알림 대상) — SYS-005
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT user_id, user_level FROM sys_user
               WHERE tenant_id=%s AND login_id=%s AND status='ACTIVE'""", (tid, login))
        row = cur.fetchone()
    if not row:
        raise HTTPException(401, detail="비활성/미존재 사용자")
    request.state.login = login
    request.state.user_id = row[0]
    request.state.level = row[1]


def min_level(name: str):
    """엔드포인트 최소 권한 — 권한승인정의서 매트릭스 축약 (쓰기=SETUP+, 관리자 작업=ADMIN)."""
    def dep(request: Request) -> None:
        lvl = getattr(request.state, "level", None)
        if lvl is None:
            raise HTTPException(401, detail="인증 필요")
        if LEVEL_RANK[lvl] < LEVEL_RANK[name]:
            raise HTTPException(
                403, detail=f"권한 부족 — {name} 이상 필요 (현재 {lvl}, SYS-005)")
    return dep


SETUP = Depends(min_level("SETUP"))
ADMIN = Depends(min_level("ADMIN"))


def _notify(cur, tid: int, user_id: int, notify_type: str, title: str,
            link: str | None = None) -> None:
    cur.execute(
        """INSERT INTO sys_notification (tenant_id, user_id, notify_type, title, link_url)
           VALUES (%s,%s,%s,%s,%s)""", (tid, user_id, notify_type, title[:200], link))


router = APIRouter(prefix="/api/v1", tags=["edim"], dependencies=[Depends(require_auth)])

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


# ── SVC-01 i18n 번들 (REQ-N-015 · SYS-021) ──
@router.get("/i18n/{locale}")
def i18n_bundle(locale: str) -> dict[str, str]:
    """UI 리소스 번들 — KO 는 프론트 기본 문자열(폴백)이므로 빈 사전."""
    if locale == "ko":
        return {}
    if locale not in ("en", "ja", "zh"):
        raise HTTPException(404, detail=f"unsupported locale: {locale}")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT field, text FROM sys_translation
               WHERE tenant_id=%s AND locale=%s AND entity_type='UI'""", (tid, locale))
        return dict(cur.fetchall())


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
                               FILTER (WHERE civ.approval_status='APPROVED'), '{}'),
                      COALESCE(array_agg(civ.value_code ORDER BY civ.sort_order)
                               FILTER (WHERE civ.value_code IS NOT NULL), '{}'),
                      COALESCE(bool_or(civ.approval_status <> 'APPROVED'), false)
               FROM code_group cg
               JOIN code_item ci ON ci.group_id=cg.group_id
               LEFT JOIN code_item_value civ ON civ.item_id=ci.item_id
               WHERE cg.tenant_id=%s AND cg.group_code=%s
               GROUP BY ci.item_slot, ci.item_name, ci.sort_order
               ORDER BY ci.item_slot""", (tid, group))
        return [
            {"slot": r[0], "label": r[1], "values": list(r[2]),
             "allValues": list(r[3]), "count": len(r[3]),
             "status": "PENDING" if r[4] else "APPROVED", "approved": not r[4]}
            for r in cur.fetchall()
        ]


class ExpandRequest(BaseModel):
    rootCode: str = "KDCR 3-13"
    slotValues: dict[str, str]


def _expand_rows(cur, tid: int, root_code: str, slot_values: dict[str, str]) -> list[tuple]:
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
            (json.dumps(slot_values), tid, root_code, SOURCE_PRIORITY))
    return cur.fetchall()


def _resolved(main: str, slots: dict[str, str]) -> str:
    parts = [v for _, v in sorted(slots.items()) if v]
    return f"{main}-{'-'.join(parts)}" if parts else main


@router.post("/codes/products/expand")
def expand(body: ExpandRequest) -> dict[str, Any]:
    """BOM 재귀 전개 — code_relationship + slot_map (verify_runtime.sql T1 과 동일 로직)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        rows = _expand_rows(cur, tid, body.rootCode, body.slotValues)
    if not rows:
        raise HTTPException(404, detail=f"root code not found: {body.rootCode}")

    resolved = _resolved
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


# ── SVC-05 Table CRUD + Excel Import (TBL-001~006) ──
def _table_id(cur, tid: int, name: str) -> tuple[int, list[str]]:
    cur.execute(
        """SELECT table_id, column_def FROM tbl_data_table
           WHERE tenant_id=%s AND table_name=%s""", (tid, name))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, detail=f"table not found: {name}")
    return row[0], list(row[1].get("columns", []))


@router.get("/tables/{name}")
def get_table(name: str) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        table_id, columns = _table_id(cur, tid, name)
        cur.execute(
            """SELECT row_key, row_values FROM tbl_data_row
               WHERE table_id=%s ORDER BY row_key_num NULLS LAST, row_key""", (table_id,))
        rows = [{"key": r[0], "values": r[1]} for r in cur.fetchall()]
    return {"name": name, "columns": columns, "rows": rows}


class TableRowRequest(BaseModel):
    key: str
    values: dict[str, float | int | None] = {}


@router.post("/tables/{name}/rows", status_code=201, dependencies=[SETUP])
def add_table_row(name: str, body: TableRowRequest) -> dict[str, Any]:
    key = body.key.strip()
    if not key:
        raise HTTPException(422, detail="Key 필수")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        table_id, _ = _table_id(cur, tid, name)
        cur.execute("SELECT 1 FROM tbl_data_row WHERE table_id=%s AND row_key=%s",
                    (table_id, key))
        if cur.fetchone():
            raise HTTPException(409, detail=f"Key 중복: {key}")
        num = float(key) if key.replace(".", "", 1).isdigit() else None
        cur.execute(
            """INSERT INTO tbl_data_row (table_id, row_key, row_key_num, row_values)
               VALUES (%s,%s,%s,%s)""",
            (table_id, key, num, json.dumps({k: v for k, v in body.values.items() if v is not None})))
    return {"key": key}


@router.put("/tables/{name}/rows/{key}", dependencies=[SETUP])
def update_table_row(name: str, key: str, body: TableRowRequest) -> dict[str, Any]:
    values = {k: v for k, v in body.values.items() if v is not None}
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        table_id, _ = _table_id(cur, tid, name)
        cur.execute(
            """UPDATE tbl_data_row SET row_values=%s
               WHERE table_id=%s AND row_key=%s RETURNING row_id""",
            (json.dumps(values), table_id, key))
        if not cur.fetchone():
            raise HTTPException(404, detail=f"row not found: {key}")
    return {"key": key, "values": values}


@router.delete("/tables/{name}/rows/{key}", dependencies=[SETUP])
def delete_table_row(name: str, key: str) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        table_id, _ = _table_id(cur, tid, name)
        cur.execute("DELETE FROM tbl_data_row WHERE table_id=%s AND row_key=%s RETURNING row_id",
                    (table_id, key))
        if not cur.fetchone():
            raise HTTPException(404, detail=f"row not found: {key}")
    return {"deleted": key}


@router.post("/tables/{name}/import-excel", dependencies=[SETUP])
async def import_excel(name: str, uploadedFile: UploadFile = File(...)) -> dict[str, Any]:
    """정형 양식(1행 헤더 = Key + 열 이름) — Key 중복은 갱신, 수치 아닌 셀은 무시."""
    import openpyxl
    data = await uploadedFile.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    except Exception:  # noqa: BLE001
        raise HTTPException(422, detail="Excel 파일이 아닙니다 (.xlsx)")
    ws = wb.active
    header = [str(c.value).strip() if c.value is not None else "" for c in ws[1]]
    inserted = updated = 0
    rejected: list[str] = []
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        table_id, columns = _table_id(cur, tid, name)
        col_idx = {c: header.index(c) for c in columns if c in header}
        if not col_idx:
            raise HTTPException(422, detail=f"헤더 불일치 — 필요 열: {columns}")
        for row in ws.iter_rows(min_row=2):
            key = str(row[0].value).strip() if row[0].value is not None else ""
            if not key:
                continue
            values: dict[str, float] = {}
            for col, idx in col_idx.items():
                v = row[idx].value
                if isinstance(v, (int, float)):
                    values[col] = v
                elif v is not None:
                    rejected.append(f"{key}.{col}: 수치 아님 ({v})")
            num = float(key) if key.replace(".", "", 1).isdigit() else None
            cur.execute(
                """INSERT INTO tbl_data_row (table_id, row_key, row_key_num, row_values)
                   VALUES (%s,%s,%s,%s)
                   ON CONFLICT (table_id, row_key)
                   DO UPDATE SET row_values = tbl_data_row.row_values || EXCLUDED.row_values
                   RETURNING (xmax = 0)""",
                (table_id, key, num, json.dumps(values)))
            if cur.fetchone()[0]:
                inserted += 1
            else:
                updated += 1
    return {"inserted": inserted, "updated": updated, "rejected": rejected}


# ── AI-04/06 — Prompt→Macro · UI 초안 (ANTHROPIC_API_KEY 없으면 sample 모드) ──
class AiMacroRequest(BaseModel):
    prompt: str


@router.post("/ai/macro-generate", dependencies=[SETUP])
def ai_macro_generate(body: AiMacroRequest) -> dict[str, Any]:
    from app.services.ai_assist import generate_macro
    if not body.prompt.strip():
        raise HTTPException(422, detail="Prompt 를 입력하십시오")
    return generate_macro(body.prompt.strip())


class AiUiRequest(BaseModel):
    description: str


@router.post("/ai/ui-suggest", dependencies=[SETUP])
def ai_ui_suggest(body: AiUiRequest) -> dict[str, Any]:
    from app.services.ai_assist import suggest_ui
    if not body.description.strip():
        raise HTTPException(422, detail="설명을 입력하십시오")
    return suggest_ui(body.description.strip())


# ── ENG-01 Macro 실행 엔진 v1 ──
def _make_table_resolver(cur, tid: int):
    cache: dict[str, list[tuple[float | None, str, dict]]] = {}

    def load(table: str):
        if table in cache:
            return cache[table]
        cur.execute(
            """SELECT r.row_key_num, r.row_key, r.row_values
               FROM tbl_data_table t JOIN tbl_data_row r ON r.table_id=t.table_id
               WHERE t.tenant_id=%s AND t.table_name=%s
               ORDER BY r.row_key_num NULLS LAST""", (tid, table))
        rows = [(float(r[0]) if r[0] is not None else None, r[1], r[2]) for r in cur.fetchall()]
        if not rows:
            raise MacroError(f"Table 없음 또는 빈 Table: {table}")
        cache[table] = rows
        return rows

    def resolve(table: str, col: str, key, agg: str) -> float:
        rows = load(table)
        if agg == "GET":
            for num, rkey, values in rows:
                if (isinstance(key, float) and num is not None and abs(num - key) < 1e-9) \
                        or rkey == str(key) or (isinstance(key, float) and rkey == f"{key:g}"):
                    if col not in values:
                        raise MacroError(f"{table}[{rkey}] 에 열 {col} 없음")
                    return float(values[col])
            key_disp = f"{key:g}" if isinstance(key, float) else str(key)
            raise MacroError(f"{table}: key {key_disp} 없음")
        lo, hi = key
        vals = [float(v[col]) for num, _, v in rows
                if num is not None and lo <= num <= hi and col in v]
        if not vals:
            raise MacroError(f"{table}({col},{lo:g}:{hi:g}) 범위에 값 없음")
        if agg == "SUM":
            return sum(vals)
        if agg == "AVG":
            return sum(vals) / len(vals)
        if agg == "MIN":
            return min(vals)
        if agg == "MAX":
            return max(vals)
        return float(len(vals))

    return resolve


class EvaluateRequest(BaseModel):
    formula: str
    variables: dict[str, float] = {}


@router.post("/macros/evaluate")
def evaluate_macro(body: EvaluateRequest) -> dict[str, Any]:
    """Excel 호환 Macro 평가 — Table 참조는 실 tbl_data_row (TBX-011)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        ev = Evaluator(body.variables, _make_table_resolver(cur, tid))
        try:
            value = ev.run(body.formula)
        except MacroError as e:
            return {"ok": False, "error": str(e), "trace": ev.trace}
    return {"ok": True, "value": value, "trace": ev.trace}


# ── SVC-12 파일 업/다운로드 (MinIO 프록시) ──
@router.post("/files/upload", status_code=201, dependencies=[SETUP])
async def upload_file(
    uploadedFile: UploadFile = File(...),
    folder: str = Form("RECEIVED"),
    project: str = Form("PS-61313-5"),
) -> dict[str, Any]:
    if folder not in ("DWG", "PRICE", "DATA", "BOM", "RECEIVED"):
        raise HTTPException(422, detail=f"folder 오류: {folder}")
    data = await uploadedFile.read()
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(413, detail="100MB 초과")
    fname = (uploadedFile.filename or "file").replace("/", "_")
    key = f"{project}/{folder}/{fname}"
    try:
        storage.put_object(key, data, uploadedFile.content_type or "application/octet-stream")
    except RuntimeError:
        raise HTTPException(503, detail="storage unavailable")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute("SELECT project_id FROM prj_project WHERE tenant_id=%s AND project_no=%s",
                    (tid, project))
        prj = cur.fetchone()
        cur.execute(
            """INSERT INTO dwg_file (tenant_id, project_id, folder, file_name, file_type,
               file_path, file_size)
               VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING file_id""",
            (tid, prj[0] if prj else None, folder, fname,
             (fname.rsplit(".", 1)[-1] if "." in fname else "BIN").upper()[:10],
             key, len(data)))
        file_id = cur.fetchone()[0]
    return {"fileId": file_id, "key": key, "size": len(data)}


@router.get("/files/download/{file_id}")
def download_file(file_id: int) -> StreamingResponse:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT file_path, file_name FROM dwg_file WHERE tenant_id=%s AND file_id=%s",
            (tid, file_id))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, detail=f"file not found: {file_id}")
    try:
        obj = storage.get_object(row[0])
    except RuntimeError:
        raise HTTPException(503, detail="storage unavailable")
    from urllib.parse import quote
    return StreamingResponse(
        obj.stream(64 * 1024), media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(row[1])}"})


# ── INT-04 CAD 호환 — DXF 뷰/Import/Export (DWG 는 ODA 플러그블) ──
def _parse_cad_bytes(data: bytes, file_name: str) -> dict[str, Any]:
    """DXF(직접)/DWG(ODA 변환 후) → 정규화 DrawingDocument(JSON)."""
    import tempfile
    from pathlib import Path

    from app.services.dwg_converter import get_configured_dwg_converter
    from app.services.dxf_importer import convert_dxf_to_drawing_document

    ext = Path(file_name).suffix.lower()
    if ext not in (".dxf", ".dwg"):
        raise HTTPException(422, detail=f"지원하지 않는 CAD 형식: {ext} (.dxf/.dwg)")
    with tempfile.TemporaryDirectory(prefix="edim_cad_") as tmp:
        src = Path(tmp) / Path(file_name).name
        src.write_bytes(data)
        dxf_path = str(src)
        source_format = "dxf"
        if ext == ".dwg":
            dxf_path = get_configured_dwg_converter().convert(str(src))  # 미설정 → 501
            source_format = "dwg"
        doc = convert_dxf_to_drawing_document(dxf_path, Path(file_name).stem, source_format)
    return doc.model_dump()


@router.get("/cad/view/{file_id}")
def cad_view(file_id: int) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT file_path, file_name FROM dwg_file WHERE tenant_id=%s AND file_id=%s",
            (tid, file_id))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, detail=f"file not found: {file_id}")
    try:
        obj = storage.get_object(row[0])
        data = obj.read()
    except RuntimeError:
        raise HTTPException(503, detail="storage unavailable")
    return {"fileId": file_id, "document": _parse_cad_bytes(data, row[1])}


@router.post("/cad/import", status_code=201, dependencies=[SETUP])
async def cad_import(
    uploadedFile: UploadFile = File(...),
    project: str = Form("PS-61313-5"),
) -> dict[str, Any]:
    data = await uploadedFile.read()
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(413, detail="100MB 초과")
    fname = (uploadedFile.filename or "drawing.dxf").replace("/", "_")
    document = _parse_cad_bytes(data, fname)   # 파싱 실패 시 저장하지 않음
    key = f"{project}/DWG/{fname}"
    try:
        storage.put_object(key, data, uploadedFile.content_type or "application/dxf")
    except RuntimeError:
        raise HTTPException(503, detail="storage unavailable")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute("SELECT project_id FROM prj_project WHERE tenant_id=%s AND project_no=%s",
                    (tid, project))
        prj = cur.fetchone()
        cur.execute(
            """INSERT INTO dwg_file (tenant_id, project_id, folder, file_name, file_type,
               file_path, file_size)
               VALUES (%s,%s,'DWG',%s,%s,%s,%s) RETURNING file_id""",
            (tid, prj[0] if prj else None, fname,
             fname.rsplit(".", 1)[-1].upper()[:10], key, len(data)))
        file_id = cur.fetchone()[0]
    return {"fileId": file_id, "document": document}


@router.get("/cad/arrangement")
def cad_arrangement() -> dict[str, Any]:
    """C-1 구성 캔버스의 CAD 정본 — 실 DXF 작도 후 정규화 문서로 반환."""
    from app.services.run_pipeline import build_arrangement_dxf
    data = build_arrangement_dxf()
    return {"document": _parse_cad_bytes(data, "AHU5_arrangement.dxf")}


@router.get("/cad/arrangement.dxf")
def cad_arrangement_dxf() -> StreamingResponse:
    import io as _io

    from app.services.run_pipeline import build_arrangement_dxf
    return StreamingResponse(
        _io.BytesIO(build_arrangement_dxf()), media_type="application/dxf",
        headers={"Content-Disposition": "attachment; filename=AHU5_arrangement.dxf"})


class PartDrawingRequest(BaseModel):
    dims: dict[str, float] = {}


@router.post("/cad/part-drawing")
def cad_part_drawing(body: PartDrawingRequest) -> dict[str, Any]:
    """Design Editor CAD 모드 — 현재 치수로 부품도 작도 후 정규화 문서 반환.
    dims 미지정 시 dwg_dimension 엔진 평가값 사용."""
    from app.services import run_pipeline as rp
    dims = {k: float(v) for k, v in body.dims.items()}
    if not dims:
        r = rp.PipelineResult()
        with _conn() as conn, conn.cursor() as cur:
            tid = _tenant_id(cur)
            rp.step_dims(cur, tid, _make_table_resolver(cur, tid), r)
        dims = r.dims
    data = rp.build_part_dxf(dims)
    return {"dims": dims, "document": _parse_cad_bytes(data, "KDCR3-13_part.dxf")}


class CadExportRequest(BaseModel):
    dims: dict[str, float] = {}


@router.post("/cad/export-dxf", dependencies=[SETUP])
def cad_export(body: CadExportRequest) -> StreamingResponse:
    """현재 치수(미지정 시 dwg_dimension 평가값)로 제작 DXF 생성 — 순수 다운로드."""
    import io as _io

    from app.services import run_pipeline as rp

    r = rp.PipelineResult()
    if body.dims:
        r.dims = {k: float(v) for k, v in body.dims.items()}
    else:
        with _conn() as conn, conn.cursor() as cur:
            tid = _tenant_id(cur)
            rp.step_dims(cur, tid, _make_table_resolver(cur, tid), r)
    rp.step_drawing(r)
    _, fname, _, data = r.files[0]
    return StreamingResponse(
        _io.BytesIO(data), media_type="application/dxf",
        headers={"Content-Disposition": f"attachment; filename={fname}"})


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


# ── SVC-10 Approval (승인함 M-15-2) ──
@router.get("/approvals/inbox")
def approvals_inbox() -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT a.approval_id, a.target_table, a.request_type, a.step,
                      u.user_name, to_char(a.requested_at,'MM-DD'), a.comment,
                      COALESCE(pc.main_code, dc.doc_no, a.target_table||'#'||a.target_id)
               FROM sys_approval_request a
               JOIN sys_user u ON u.user_id=a.requester_id
               LEFT JOIN product_code pc
                 ON a.target_table='product_code' AND pc.product_code_id=a.target_id
               LEFT JOIN doc_control dc
                 ON a.target_table='doc_control' AND dc.doc_control_id=a.target_id
               WHERE a.tenant_id=%s AND a.result IS NULL
               ORDER BY a.approval_id""", (tid,))
        type_label = {"product_code": "Code", "doc_control": "문서",
                      "code_item": "Code", "tbx_macro": "Macro"}
        return [
            {"id": r[0], "assetType": type_label.get(r[1], r[1]),
             "target": r[6] or r[7], "reqKind": r[2], "requester": r[4],
             "reqDate": r[5], "stage": r[3], "tested": r[1] == "tbx_macro"}
            for r in cur.fetchall()
        ]


class DecideRequest(BaseModel):
    approve: bool
    comment: str = ""


@router.post("/approvals/{approval_id}/decide", dependencies=[SETUP])
def decide(approval_id: int, request: Request, body: DecideRequest) -> dict[str, Any]:
    if not body.approve and not body.comment.strip():
        raise HTTPException(422, detail="반려는 코멘트 필수")
    result = "APPROVED" if body.approve else "REJECTED"
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """UPDATE sys_approval_request
               SET result=%s, comment=NULLIF(%s,'') , decided_at=now()
               WHERE tenant_id=%s AND approval_id=%s AND result IS NULL
               RETURNING target_table, target_id, requester_id, comment""",
            (result, body.comment.strip(), tid, approval_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"처리 가능한 요청 없음: {approval_id}")
        # 요청자 알림 (SVC-13)
        _notify(cur, tid, row[2], "APPROVAL_RESULT",
                f"{'승인' if body.approve else '반려'} — {row[0]} #{row[1]}"
                + (f" ({body.comment.strip()})" if body.comment.strip() else ""),
                "/common")
        # 대상 자산 상태 전이 + 이력
        if row[0] == "product_code":
            cur.execute(
                "UPDATE product_code SET approval_status=%s WHERE product_code_id=%s",
                ("APPROVED" if body.approve else "REJECTED", row[1]))
        cur.execute("SELECT user_id FROM sys_user WHERE tenant_id=%s AND login_id='edim'", (tid,))
        actor = cur.fetchone()
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (tid, row[0], row[1], result, actor[0] if actor else 1,
             json.dumps({"comment": body.comment})))
    return {"approvalId": approval_id, "result": result}


# ── SVC-13 알림 ──
@router.get("/notifications")
def notifications(request: Request, limit: int = 20) -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT notification_id, notify_type, title, link_url, is_read,
                      to_char(created_at,'MM-DD HH24:MI')
               FROM sys_notification
               WHERE tenant_id=%s AND user_id=%s
               ORDER BY is_read, notification_id DESC LIMIT %s""",
            (tid, request.state.user_id, limit))
        return [
            {"id": r[0], "type": r[1], "title": r[2], "link": r[3],
             "read": r[4], "at": r[5]}
            for r in cur.fetchall()
        ]


@router.post("/notifications/{notification_id}/read")
def read_notification(notification_id: int, request: Request) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """UPDATE sys_notification SET is_read=true
               WHERE tenant_id=%s AND user_id=%s AND notification_id=%s""",
            (tid, request.state.user_id, notification_id))
    return {"id": notification_id, "read": True}


# ── SVC-11 Documents (문서함 M-5-4) ──
STATUS_LABEL = {"SET_UP": "Set-up", "CHECK": "Check", "APPROVE": "Approve 대기", "ACCEPTED": "Accepted"}


@router.get("/documents")
def documents() -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT d.doc_no, d.title, d.person, to_char(d.created_at,'MM-DD'),
                      d.released_status, u.user_name,
                      to_char(d.approval_date,'MM-DD'), d.version, d.management_grade
               FROM doc_control d LEFT JOIN sys_user u ON u.user_id=d.approver_id
               WHERE d.tenant_id=%s ORDER BY d.doc_control_id""", (tid,))
        return [
            {"docNo": r[0], "title": r[1], "person": r[2], "date": r[3],
             "status": STATUS_LABEL[r[4]], "approver": r[5] or "-",
             "appDate": r[6] or "-", "version": r[7], "grade": r[8]}
            for r in cur.fetchall()
        ]


# ── SVC-01 Users (M-14-6) ──
ROLE_LABEL = {"PLATFORM": "Platform", "ADMIN": "관리자", "SETUP": "설계 Set-up", "GENERAL": "일반"}


@router.get("/users", dependencies=[SETUP])
def users() -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT login_id, user_name, department, user_level, status
               FROM sys_user WHERE tenant_id=%s ORDER BY user_id""", (tid,))
        return [
            {"login": r[0], "name": r[1], "dept": r[2] or "-", "level": r[3],
             "role": (r[2] or "") + " " + ROLE_LABEL.get(r[3], r[3]), "status": r[4]}
            for r in cur.fetchall()
        ]


@router.post("/users/{login}/unlock", dependencies=[ADMIN])
def unlock_user(login: str) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """UPDATE sys_user SET status='ACTIVE'
               WHERE tenant_id=%s AND login_id=%s AND status='LOCKED'
               RETURNING user_id""", (tid, login))
        if not cur.fetchone():
            raise HTTPException(404, detail=f"LOCKED 계정 아님: {login}")
    return {"login": login, "status": "ACTIVE"}


# ── SVC-09 ERP 이벤트 (업무함 M-15-3 · Dashboard 경고) ──
@router.get("/erp/events")
def erp_events() -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT e.event_id, d.proc_code, d.proc_name, p.project_no,
                      COALESCE(u.user_name,'-'), to_char(e.due_date,'MM-DD'),
                      e.status, (e.due_date < CURRENT_DATE AND e.status <> 'DONE')
               FROM erp_process_event e
               JOIN erp_process_def d ON d.proc_def_id=e.proc_def_id
               JOIN prj_project p ON p.project_id=e.project_id
               LEFT JOIN sys_user u ON u.user_id=e.assignee_id
               WHERE e.tenant_id=%s ORDER BY e.event_id""", (tid,))
        return [
            {"eventId": r[0], "code": r[1], "procName": r[2], "project": r[3],
             "owner": r[4], "deadline": r[5] or "-",
             "delayed": bool(r[7]),
             "status": "DONE" if r[6] == "DONE" else ("지연" if r[7] else
                       ("진행" if r[6] == "IN_PROGRESS" else "TODO"))}
            for r in cur.fetchall()
        ]


class CompleteRequest(BaseModel):
    comment: str = ""


@router.post("/erp/events/{event_id}/complete")
def complete_event(event_id: int, body: CompleteRequest) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """UPDATE erp_process_event SET status='DONE', done_at=now(),
               data=COALESCE(data,'{}'::jsonb) || %s::jsonb
               WHERE tenant_id=%s AND event_id=%s AND status<>'DONE'
               RETURNING event_id""",
            (json.dumps({"comment": body.comment}), tid, event_id))
        if not cur.fetchone():
            raise HTTPException(404, detail=f"완료 처리 대상 아님: {event_id}")
    return {"eventId": event_id, "status": "DONE"}


# ── SVC-09 Project (S-3-5) ──
STAGE_MAP = {"기술 제안": "TECH_PROPOSAL", "견적": "QUOTE", "협의": "NEGOTIATION",
             "계약": "CONTRACT", "계약 변경": "CONTRACT_CHANGE", "종료": "CLOSED"}
STAGE_LABEL = {v: k for k, v in STAGE_MAP.items()}


@router.get("/projects/{project_no}")
def get_project(project_no: str) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT project_no, project_name, project_type, sales_stage, client_contact
               FROM prj_project WHERE tenant_id=%s AND project_no=%s""", (tid, project_no))
        r = cur.fetchone()
    if not r:
        raise HTTPException(404, detail=f"project not found: {project_no}")
    return {"projectNo": r[0], "projectName": r[1], "projectType": r[2] or "Client",
            "stage": STAGE_LABEL.get(r[3], r[3]), "clientContact": r[4] or ""}


class StagePatch(BaseModel):
    stage: str


@router.patch("/projects/{project_no}", dependencies=[SETUP])
def patch_project(project_no: str, body: StagePatch) -> dict[str, Any]:
    code = STAGE_MAP.get(body.stage)
    if not code:
        raise HTTPException(422, detail=f"알 수 없는 영업 단계: {body.stage}")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """UPDATE prj_project SET sales_stage=%s, updated_at=now()
               WHERE tenant_id=%s AND project_no=%s RETURNING project_id""",
            (code, tid, project_no))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"project not found: {project_no}")
        cur.execute("SELECT user_id FROM sys_user WHERE tenant_id=%s LIMIT 1", (tid,))
        actor = cur.fetchone()
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'prj_project',%s,'STAGE',%s,%s)""",
            (tid, row[0], actor[0], json.dumps({"stage": code})))
    return {"projectNo": project_no, "stage": body.stage}


# ── SVC-08 단가 대장 ──
@router.get("/prices")
def prices() -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT pc.main_code, pc.code_name, COALESCE(cc.company_name,'-'),
                      p.price, p.price_source, p.valid_from, p.valid_to,
                      (p.valid_from <= CURRENT_DATE AND
                       (p.valid_to IS NULL OR p.valid_to >= CURRENT_DATE))
               FROM cst_price p
               JOIN product_code pc ON pc.product_code_id=p.product_code_id
               LEFT JOIN com_company cc ON cc.company_id=p.supplier_id
               WHERE p.tenant_id=%s AND pc.main_code IN ('FDV-480','KDC-1','EWT-3')
               ORDER BY pc.main_code, p.valid_from DESC""", (tid,))
        return [
            {"code": r[0], "name": r[1], "supplier": r[2], "price": float(r[3]),
             "source": SOURCE_LABEL[r[4]], "from": r[5].isoformat(),
             "to": r[6].isoformat() if r[6] else None, "active": bool(r[7])}
            for r in cur.fetchall()
        ]


# ── B3 — 단가 등록 (M-12-5 ＋ 단가 등록) ──

SOURCE_CODE = {"견적적용": "APPLIED", "구매": "PURCHASE", "재고": "STOCK", "견적": "QUOTE"}


class PriceCreate(BaseModel):
    code: str
    supplier: str = "-"
    price: float
    source: str = "QUOTE"        # enum 또는 한글 라벨
    validFrom: str               # YYYY-MM-DD
    validTo: str | None = None


@router.post("/prices", status_code=201, dependencies=[SETUP])
def create_price(body: PriceCreate) -> dict[str, Any]:
    src = SOURCE_CODE.get(body.source.strip(), body.source.strip().upper())
    if src not in ("APPLIED", "PURCHASE", "STOCK", "QUOTE"):
        raise HTTPException(422, detail=f"단가 Table 구분 오류: {body.source}")
    if body.price <= 0:
        raise HTTPException(422, detail="단가는 0 보다 커야 합니다")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT product_code_id FROM product_code WHERE tenant_id=%s AND main_code=%s",
            (tid, body.code.strip()))
        pc = cur.fetchone()
        if not pc:
            raise HTTPException(404, detail=f"코드 없음: {body.code}")
        supplier_id = None
        name = body.supplier.strip()
        if name and name != "-":
            cur.execute(
                "SELECT company_id FROM com_company WHERE tenant_id=%s AND company_name=%s",
                (tid, name))
            row = cur.fetchone()
            if row:
                supplier_id = row[0]
            else:
                cur.execute(
                    """INSERT INTO com_company (tenant_id, company_name, company_type)
                       VALUES (%s,%s,'SUPPLIER') RETURNING company_id""", (tid, name))
                supplier_id = cur.fetchone()[0]
        try:
            cur.execute(
                """INSERT INTO cst_price (tenant_id, product_code_id, supplier_id,
                   price, price_source, valid_from, valid_to)
                   VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING price_id""",
                (tid, pc[0], supplier_id, body.price, src,
                 body.validFrom, body.validTo))
        except Exception as e:  # EXCLUDE 기간 중복 (DB v0.5)
            if "exclusion" in str(e).lower() or "overlap" in str(e).lower():
                raise HTTPException(409, detail="기간 중복 — 동일 Table·Code 의 유효기간이 겹칩니다 (EXCLUDE)") from e
            raise
        price_id = cur.fetchone()[0]
    return {"priceId": price_id, "source": src}


@router.post("/prices/import-excel", dependencies=[SETUP])
async def import_prices_excel(uploadedFile: UploadFile = File(...)) -> dict[str, Any]:
    """단가 Excel Import — 헤더: Code·공급처·단가·Table·적용시작·적용종료 (행 단위 등록)."""
    import openpyxl
    data = await uploadedFile.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    except Exception:  # noqa: BLE001
        raise HTTPException(422, detail="Excel 파일이 아닙니다 (.xlsx)")
    ws = wb.active
    header = [str(c.value).strip() if c.value is not None else "" for c in ws[1]]
    required = ["Code", "단가", "Table", "적용시작"]
    if any(h not in header for h in required):
        raise HTTPException(422, detail=f"헤더 불일치 — 필요 열: {required} (+공급처·적용종료 선택)")
    idx = {h: header.index(h) for h in header if h}
    inserted = 0
    rejected: list[str] = []
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        for r_i, row in enumerate(ws.iter_rows(min_row=2), start=2):
            def cell(col: str) -> str:
                i = idx.get(col)
                v = row[i].value if i is not None else None
                return str(v).strip() if v is not None else ""
            code = cell("Code")
            if not code:
                continue
            try:
                price = float(cell("단가"))
                src = SOURCE_CODE.get(cell("Table"), cell("Table").upper())
                if src not in ("APPLIED", "PURCHASE", "STOCK", "QUOTE"):
                    raise ValueError(f"Table 구분 오류: {cell('Table')}")
                cur.execute(
                    "SELECT product_code_id FROM product_code WHERE tenant_id=%s AND main_code=%s",
                    (tid, code))
                pc = cur.fetchone()
                if not pc:
                    raise ValueError(f"코드 없음: {code}")
                supplier_id = None
                name = cell("공급처")
                if name and name != "-":
                    cur.execute(
                        "SELECT company_id FROM com_company WHERE tenant_id=%s AND company_name=%s",
                        (tid, name))
                    found = cur.fetchone()
                    if found:
                        supplier_id = found[0]
                    else:
                        cur.execute(
                            """INSERT INTO com_company (tenant_id, company_name, company_type)
                               VALUES (%s,%s,'SUPPLIER') RETURNING company_id""", (tid, name))
                        supplier_id = cur.fetchone()[0]
                # 행 단위 SAVEPOINT — EXCLUDE 위반 행만 거부하고 계속
                cur.execute("SAVEPOINT price_row")
                try:
                    cur.execute(
                        """INSERT INTO cst_price (tenant_id, product_code_id, supplier_id,
                           price, price_source, valid_from, valid_to)
                           VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                        (tid, pc[0], supplier_id, price, src,
                         cell("적용시작"), cell("적용종료") or None))
                    inserted += 1
                except Exception as e:  # noqa: BLE001
                    cur.execute("ROLLBACK TO SAVEPOINT price_row")
                    if "exclusion" in str(e).lower() or "overlap" in str(e).lower():
                        raise ValueError("기간 중복 (EXCLUDE)") from e
                    raise ValueError(str(e)[:80]) from e
            except ValueError as e:
                rejected.append(f"{r_i}행 {code}: {e}")
    return {"inserted": inserted, "rejected": rejected}


# ── SYS-012 이력 (M-15-9) ──
@router.get("/history")
def history(limit: int = 20) -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT to_char(h.acted_at,'MM-DD HH24:MI'), h.target_table||' #'||h.target_id,
                      h.action, u.user_name
               FROM sys_history h JOIN sys_user u ON u.user_id=h.actor_id
               WHERE h.tenant_id=%s ORDER BY h.history_id DESC LIMIT %s""", (tid, limit))
        return [
            {"at": r[0], "target": r[1], "action": r[2], "by": r[3]}
            for r in cur.fetchall()
        ]


# ── 잔여 mock 실데이터화 (v4.0) — 치수 정의·Macro 목록·공정 정의·역참조 ──

@router.get("/drawings/dimensions")
def drawing_dimensions(drawing: str = "KDCR 3-13") -> list[dict[str, Any]]:
    """Design Rule 치수 Set-up — dwg_dimension + tbx_macro (Design Editor·부품 상세 실데이터)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT d.dim_label, d.dim_type, d.variant_value, m.macro_expr
               FROM dwg_dimension d
               JOIN dwg_drawing w ON w.drawing_id=d.drawing_id
               LEFT JOIN tbx_macro m ON m.macro_id=d.macro_id
               WHERE d.tenant_id=%s AND w.drawing_no=%s
               ORDER BY d.dim_label""", (tid, drawing))
        return [
            {"no": r[0],
             "value": (r[3] if r[3] else (r[2] or "")),
             "binding": "MACRO" if r[3] else "VARIANT",
             "kind": r[1]}
            for r in cur.fetchall()
        ]


@router.get("/macros")
def macros_list() -> list[dict[str, Any]]:
    """Toolbox Macro 라이브러리 — tbx_macro 실데이터 (S-2-2 좌측 목록)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT macro_name, macro_expr, status, COALESCE(hierarchy_address,''),
                      COALESCE(prompt_text,''), COALESCE(description_text,'')
               FROM tbx_macro WHERE tenant_id=%s ORDER BY macro_id""", (tid,))
        return [
            {"name": r[0], "expr": r[1], "status": r[2], "address": r[3],
             "prompt": r[4], "description": r[5]}
            for r in cur.fetchall()
        ]


@router.get("/erp/process-defs")
def process_defs() -> dict[str, Any]:
    """공정 정의·흐름 — erp_process_def + erp_process_edge (M-14-7·Dashboard 흐름)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT proc_def_id, proc_code, proc_name, department, is_auto
               FROM erp_process_def WHERE tenant_id=%s ORDER BY proc_def_id""", (tid,))
        defs = [{"id": r[0], "code": r[1], "name": r[2], "dept": r[3], "auto": bool(r[4])}
                for r in cur.fetchall()]
        cur.execute(
            "SELECT from_def_id, to_def_id FROM erp_process_edge WHERE tenant_id=%s", (tid,))
        edges = [{"from": r[0], "to": r[1]} for r in cur.fetchall()]
    return {"defs": defs, "edges": edges}


@router.get("/codes/{code}/referencers")
def code_referencers(code: str) -> list[dict[str, Any]]:
    """Where-Used 역참조 — 이 코드를 child 로 갖는 mother (코드 상세 Referencers)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT mc.main_code, mc.code_name, r.quantity, r.approval_status
               FROM code_relationship r
               JOIN product_code cc ON cc.product_code_id=r.child_code_id
               JOIN product_code mc ON mc.product_code_id=r.mother_code_id
               WHERE r.tenant_id=%s AND cc.main_code=%s
               ORDER BY mc.main_code""", (tid, code))
        return [
            {"code": r[0], "name": r[1], "qty": float(r[2]), "status": r[3]}
            for r in cur.fetchall()
        ]


# ── B1 — 범용 승인 요청 (모든 화면의 승인 요청 버튼 실배선) + Macro 저장 ──

class ApprovalCreate(BaseModel):
    targetTable: str
    targetId: int = 0
    requestType: str = "UPDATE"
    label: str = ""


@router.post("/approvals", status_code=201, dependencies=[SETUP])
def create_approval(request: Request, body: ApprovalCreate) -> dict[str, Any]:
    """범용 승인 요청 — Design Editor·Macro Studio·Print Set-up·UI Designer 등."""
    tt = body.targetTable.strip()[:50] or "asset"
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        actor_id = request.state.user_id
        cur.execute(
            """INSERT INTO sys_approval_request (tenant_id, target_table, target_id,
               request_type, step, requester_id, comment)
               VALUES (%s,%s,%s,%s,'승인',%s,%s) RETURNING approval_id""",
            (tid, tt, body.targetId, body.requestType.strip()[:20] or "UPDATE",
             actor_id, body.label.strip()[:200]))
        approval_id = cur.fetchone()[0]
        # 승인권자(SETUP+) 알림 — 요청자 제외 (SVC-13)
        cur.execute(
            """SELECT user_id FROM sys_user
               WHERE tenant_id=%s AND user_level IN ('SETUP','ADMIN') AND user_id<>%s""",
            (tid, actor_id))
        for (uid,) in cur.fetchall():
            _notify(cur, tid, uid, "APPROVAL_REQUEST",
                    f"승인 요청 — {body.label.strip()[:80] or tt}", "/common")
    return {"approvalId": approval_id, "status": "PENDING"}


class MacroSave(BaseModel):
    prompt: str = ""
    expr: str


@router.put("/macros/{name}", dependencies=[SETUP])
def save_macro(name: str, body: MacroSave) -> dict[str, Any]:
    """Macro Studio 저장 — tbx_macro upsert (DRAFT 버전)."""
    if not body.expr.strip():
        raise HTTPException(422, detail="수식이 비어 있습니다")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """UPDATE tbx_macro SET macro_expr=%s,
               prompt_text=CASE WHEN %s<>'' THEN %s ELSE prompt_text END,
               status='DRAFT'
               WHERE tenant_id=%s AND macro_name=%s RETURNING macro_id""",
            (body.expr.strip(), body.prompt.strip(), body.prompt.strip(), tid, name))
        row = cur.fetchone()
        if not row:
            cur.execute(
                """INSERT INTO tbx_macro (tenant_id, macro_name, macro_expr, prompt_text, status)
                   VALUES (%s,%s,%s,NULLIF(%s,''),'DRAFT') RETURNING macro_id""",
                (tid, name, body.expr.strip(), body.prompt.strip()))
            row = cur.fetchone()
    return {"macroId": row[0], "status": "DRAFT"}


# ── B2 — 편집 영속화: 치수 저장 · Work Process · UI Form ──

class DimsSave(BaseModel):
    drawing: str = "KDCR 3-13"
    dims: list[dict[str, Any]] = []


@router.put("/drawings/dimensions", dependencies=[SETUP])
def save_dimensions(body: DimsSave) -> dict[str, Any]:
    """Design Editor 임시저장 F12 — VARIANT 는 variant_value, =식은 바인딩된 tbx_macro 갱신."""
    n_var = n_macro = 0
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        for d in body.dims:
            label = str(d.get("no", "")).strip()[:10]
            value = str(d.get("value", "")).strip()
            if not label or not value:
                continue
            if value.startswith("="):
                cur.execute(
                    """UPDATE tbx_macro m SET macro_expr=%s, updated_at=now()
                       FROM dwg_dimension dd
                       JOIN dwg_drawing w ON w.drawing_id=dd.drawing_id
                       WHERE m.macro_id=dd.macro_id AND dd.tenant_id=%s
                         AND w.drawing_no=%s AND dd.dim_label=%s""",
                    (value, tid, body.drawing, label))
                n_macro += cur.rowcount
            else:
                try:
                    num = float(value)
                except ValueError:
                    continue
                # MACRO 바인딩 치수의 평가값은 파생값 — 덮어쓰지 않음 (ck_dim_binding)
                cur.execute(
                    """UPDATE dwg_dimension dd SET variant_value=%s, updated_at=now()
                       FROM dwg_drawing w
                       WHERE w.drawing_id=dd.drawing_id AND dd.tenant_id=%s
                         AND w.drawing_no=%s AND dd.dim_label=%s AND dd.macro_id IS NULL""",
                    (num, tid, body.drawing, label))
                n_var += cur.rowcount
    return {"variantSaved": n_var, "macroSaved": n_macro}


class WorkProcessSave(BaseModel):
    code: str = "KDCR 3-13"
    items: list[dict[str, Any]] = []   # {item, makeOrBuy}


@router.get("/erp/work-process")
def get_work_process(code: str = "KDCR 3-13") -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT wp.process_type, wp.make_or_buy
               FROM erp_work_process wp
               JOIN product_code pc ON pc.product_code_id=wp.product_code_id
               WHERE wp.tenant_id=%s AND pc.main_code=%s ORDER BY wp.seq_no""",
            (tid, code))
        return [{"item": r[0], "makeOrBuy": r[1]} for r in cur.fetchall()]


@router.put("/erp/work-process", dependencies=[SETUP])
def save_work_process(body: WorkProcessSave) -> dict[str, Any]:
    """Work Process MAKE/BUY 저장 — erp_work_process upsert (S-4-1-2 F12)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT product_code_id FROM product_code WHERE tenant_id=%s AND main_code=%s",
            (tid, body.code))
        pc = cur.fetchone()
        if not pc:
            raise HTTPException(404, detail=f"코드 없음: {body.code}")
        n = 0
        for i, it in enumerate(body.items):
            item = str(it.get("item", "")).strip()[:20]
            mob = str(it.get("makeOrBuy", "")).strip().upper()
            if not item or mob not in ("MAKE", "BUY"):
                continue
            cur.execute(
                """UPDATE erp_work_process SET make_or_buy=%s, seq_no=%s, updated_at=now()
                   WHERE tenant_id=%s AND product_code_id=%s AND process_type=%s""",
                (mob, i, tid, pc[0], item))
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO erp_work_process (tenant_id, product_code_id, process_type,
                       seq_no, make_or_buy) VALUES (%s,%s,%s,%s,%s)""",
                    (tid, pc[0], item, i, mob))
            n += 1
    return {"saved": n}


class FormSave(BaseModel):
    layout: list[dict[str, Any]] = []
    formType: str = "SCREEN"


@router.get("/toolbox/forms/{name}")
def get_form(name: str) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT form_id, version, layout_def FROM tbx_ui_form
               WHERE tenant_id=%s AND form_name=%s""", (tid, name))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"Form 없음: {name}")
    return {"formId": row[0], "version": row[1], "layout": row[2]}


@router.put("/toolbox/forms/{name}", dependencies=[SETUP])
def save_form(name: str, body: FormSave) -> dict[str, Any]:
    """UI Designer 레이아웃 저장 — tbx_ui_form upsert (version+1)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """UPDATE tbx_ui_form SET layout_def=%s, version=version+1, updated_at=now()
               WHERE tenant_id=%s AND form_name=%s RETURNING form_id, version""",
            (json.dumps(body.layout), tid, name))
        row = cur.fetchone()
        if not row:
            cur.execute(
                """INSERT INTO tbx_ui_form (tenant_id, form_name, form_type, layout_def)
                   VALUES (%s,%s,%s,%s) RETURNING form_id, version""",
                (tid, name, body.formType.strip()[:30] or "SCREEN", json.dumps(body.layout)))
            row = cur.fetchone()
    return {"formId": row[0], "version": row[1]}


# ── SVC-03 Sub Code 항목 등록 (S-1-1 write) ──
class NewItemRequest(BaseModel):
    slot: str
    name: str
    values: list[str] = []


@router.post("/codes/groups/{group}/items", status_code=201, dependencies=[SETUP])
def add_item(group: str, request: Request, body: NewItemRequest) -> dict[str, Any]:
    slot = body.slot.strip().upper()
    if not slot or not body.name.strip():
        raise HTTPException(422, detail="필수(노란 셀) 미입력")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT group_id FROM code_group WHERE tenant_id=%s AND group_code=%s", (tid, group))
        g = cur.fetchone()
        if not g:
            raise HTTPException(404, detail=f"group not found: {group}")
        cur.execute(
            "SELECT 1 FROM code_item WHERE group_id=%s AND item_slot=%s", (g[0], slot))
        if cur.fetchone():
            raise HTTPException(409, detail=f"중복 — Item {slot} 이미 등록됨 (CODE-006)")
        cur.execute(
            """INSERT INTO code_item (tenant_id, group_id, item_slot, item_name)
               VALUES (%s,%s,%s,%s) RETURNING item_id""", (tid, g[0], slot, body.name.strip()))
        item_id = cur.fetchone()[0]
        for i, v in enumerate([x for x in body.values if x.strip()]):
            cur.execute(
                """INSERT INTO code_item_value (tenant_id, item_id, value_code, sort_order,
                   approval_status) VALUES (%s,%s,%s,%s,'PENDING')""",
                (tid, item_id, v.strip()[:30], i))
        actor_id = request.state.user_id
        cur.execute(
            """INSERT INTO sys_approval_request (tenant_id, target_table, target_id,
               request_type, step, requester_id, comment)
               VALUES (%s,'code_item',%s,'CREATE','승인',%s,%s)""",
            (tid, item_id, actor_id, f"{group} / {slot}: {body.name.strip()}"))
        # 승인권자(SETUP+) 알림 — 요청자 제외 (SVC-13)
        cur.execute(
            """SELECT user_id FROM sys_user
               WHERE tenant_id=%s AND user_level IN ('SETUP','ADMIN') AND user_id<>%s""",
            (tid, actor_id))
        for (uid,) in cur.fetchall():
            _notify(cur, tid, uid, "APPROVAL_REQUEST",
                    f"승인 요청 — {group}/{slot} {body.name.strip()}", "/common")
    return {"slot": slot, "status": "PENDING"}


# ── SVC-03 Code Relationship (S-1-4) ──
@router.get("/codes/relationships/{mother}/children")
def relationship_children(mother: str) -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT c.main_code, c.code_name, r.quantity, COALESCE(r.remarks,''),
                      COALESCE(string_agg(sm.child_slot || '←' ||
                        COALESCE(sm.mother_slot, '"'||sm.fixed_value||'"'), ' · '
                        ORDER BY sm.child_slot), '-')
               FROM code_relationship r
               JOIN product_code m ON m.product_code_id=r.mother_code_id
               JOIN product_code c ON c.product_code_id=r.child_code_id
               LEFT JOIN code_relationship_slot_map sm ON sm.rel_id=r.rel_id
               WHERE r.tenant_id=%s AND m.main_code=%s AND r.approval_status='APPROVED'
               GROUP BY c.main_code, c.code_name, r.quantity, r.remarks, r.sort_order
               ORDER BY r.sort_order""", (tid, mother))
        return [
            {"code": r[0], "desc": r[1], "qty": float(r[2]), "remarks": r[3], "slotMap": r[4]}
            for r in cur.fetchall()
        ]


class RunningTestRequest(BaseModel):
    motherCode: str = "KDCR 3-13"
    slotValues: dict[str, str]


@router.post("/codes/relationships/running-test")
def running_test(body: RunningTestRequest) -> dict[str, Any]:
    """CODE-009 — Mother slot 조합으로 전량 전개 검증 (expand 재사용)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        rows = _expand_rows(cur, tid, body.motherCode, body.slotValues)
        cur.execute(
            "SELECT code_name FROM product_code WHERE tenant_id=%s AND main_code=%s",
            (tid, body.motherCode))
        mother = cur.fetchone()
    if not rows:
        raise HTTPException(404, detail=f"mother not found: {body.motherCode}")
    sv = body.slotValues
    out = [{
        "no": "Main",
        "name": f"{body.motherCode}-{sv.get('B', '?')}-{sv.get('C', '?')}-{sv.get('E', '?')}",
        "desc": mother[0] if mother else body.motherCode, "qty": 1, "remarks": "",
        "mainCode": body.motherCode,
    }]
    for i, r in enumerate(rows):
        out.append({
            "no": str(i + 1), "name": _resolved(r[0], r[4] or {}),
            "desc": r[1], "qty": float(r[2]), "remarks": "", "mainCode": r[0],
            "level": r[3], "path": r[5],
        })
    return {"passed": True, "cycleCheck": "OK", "rows": out}


# ── SVC-09 Dashboard 집계 (ERP-014) ──
@router.get("/erp/dashboard")
def dashboard() -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT count(*) FROM prj_project WHERE tenant_id=%s AND status='IN_PROGRESS'", (tid,))
        projects = cur.fetchone()[0]
        cur.execute(
            "SELECT count(*) FROM sys_approval_request WHERE tenant_id=%s AND result IS NULL", (tid,))
        pending = cur.fetchone()[0]
        cur.execute(
            """SELECT count(*) FROM erp_process_event
               WHERE tenant_id=%s AND status<>'DONE' AND due_date < CURRENT_DATE""", (tid,))
        alerts = cur.fetchone()[0]
        cur.execute(
            """SELECT d.department,
                      count(*) FILTER (WHERE e.status='TODO' AND NOT
                        (e.due_date < CURRENT_DATE)),
                      count(*) FILTER (WHERE e.status='IN_PROGRESS'),
                      count(*) FILTER (WHERE e.status='DONE'
                        AND e.done_at > now() - interval '7 days'),
                      count(*) FILTER (WHERE e.status<>'DONE' AND e.due_date < CURRENT_DATE)
               FROM erp_process_event e
               JOIN erp_process_def d ON d.proc_def_id=e.proc_def_id
               WHERE e.tenant_id=%s GROUP BY d.department ORDER BY d.department""", (tid,))
        depts = [
            {"dept": r[0], "waiting": r[1], "running": r[2], "doneWeek": r[3], "delayed": r[4]}
            for r in cur.fetchall()
        ]
    return {
        "kpis": [
            {"label": "진행 Project", "value": str(projects)},
            {"label": "승인 대기", "value": str(pending)},
            {"label": "이번 달 수주", "value": "₩ 8.4억"},   # 견적/수주 모듈 구축 전 고정값
            {"label": "이상 경고 (시간·자금)", "value": str(alerts), "err": alerts > 0},
        ],
        "deptEvents": depts,
    }


# ── SVC-09 발주 품목 (M-8-2) — 단가 resolve 실연동 ──
PR_META = {
    "FDV-480": {"supplierCode": "HS-M480", "qty": 2, "requiredDate": "08-20", "delivery": "EXW"},
    "KDC-1": {"supplierCode": "JW-C001", "qty": 4, "requiredDate": "08-15", "delivery": "지정장소"},
    "EWT-3": {"supplierCode": "-", "qty": 1, "requiredDate": "-", "delivery": "-", "stockOk": True},
}


@router.get("/erp/pr-items")
def pr_items() -> list[dict[str, Any]]:
    ref = date.today().isoformat()
    out: list[dict[str, Any]] = []
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        for code, meta in PR_META.items():
            cur.execute(
                """SELECT pc.code_name, p.price, cc.company_name
                   FROM product_code pc
                   LEFT JOIN cst_price p ON p.product_code_id=pc.product_code_id
                     AND p.valid_from <= %s::date
                     AND (p.valid_to IS NULL OR p.valid_to >= %s::date)
                   LEFT JOIN com_company cc ON cc.company_id=p.supplier_id
                   WHERE pc.tenant_id=%s AND pc.main_code=%s
                   ORDER BY array_position(%s::text[], p.price_source), p.valid_from DESC
                   LIMIT 1""", (ref, ref, tid, code, SOURCE_PRIORITY))
            r = cur.fetchone()
            if not r:
                continue
            stock_ok = bool(meta.get("stockOk"))
            out.append({
                "code": code, "name": r[0],
                "supplierCode": meta["supplierCode"],
                "supplier": "-" if stock_ok else (r[2] or "-"),
                "qty": meta["qty"],
                "price": None if stock_ok else (float(r[1]) if r[1] is not None else None),
                "requiredDate": meta["requiredDate"], "delivery": meta["delivery"],
                "stockOk": stock_ok, "checked": not stock_ok,
            })
    return out


# ── SVC-12 Project Folder 파일 (M-15-8) — cpq_output 실데이터 ──
OUTPUT_KIND = {"DWG": ("승인도", "ok"), "PRICE": ("견적/원가", "info"),
               "DATA": ("기술자료", "ok"), "BOM": ("BOM", "ok")}
RECEIVED_FILES = [
    {"name": "Micron7_사양서_v2.xlsx", "fileType": "XLSX", "kind": "접수자료",
     "kindTone": "info", "run": "-", "date": "07-07", "folder": "RECEIVED"},
    {"name": "현장 배치도.pdf", "fileType": "PDF", "kind": "접수자료",
     "kindTone": "info", "run": "-", "date": "07-07", "folder": "RECEIVED"},
]


@router.get("/files")
def project_files(project: str = "PS-61313-5") -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT o.output_type, o.data->>'file', o.data->>'fileType',
                      o.run_id, to_char(o.created_at,'MM-DD')
               FROM cpq_output o
               JOIN cpq_run r ON r.run_id=o.run_id AND r.tenant_id=%s
               WHERE r.run_id = (SELECT max(run_id) FROM cpq_run
                                 WHERE tenant_id=%s AND status='SUCCESS')
               ORDER BY o.output_id""", (tid, tid))
        rows = cur.fetchall()
    files = [
        {
            "name": (r[1] or "output").replace(" ", "_")[:60],
            "fileType": r[2] or "PDF",
            "kind": OUTPUT_KIND.get(r[0], (r[0], "info"))[0],
            "kindTone": OUTPUT_KIND.get(r[0], (r[0], "info"))[1],
            "run": f"#{r[3]}", "date": r[4], "folder": r[0],
        }
        for r in rows
    ]
    # 업로드 실파일 (dwg_file — MinIO 저장, fileId 로 다운로드 가능)
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT f.file_id, f.file_name, f.file_type, f.folder,
                      to_char(f.uploaded_date,'MM-DD')
               FROM dwg_file f
               LEFT JOIN prj_project p ON p.project_id=f.project_id
               WHERE f.tenant_id=%s AND (p.project_no=%s OR f.project_id IS NULL)
               ORDER BY f.file_id""", (tid, project))
        uploads = [
            {"name": r[1], "fileType": r[2], "kind": "업로드", "kindTone": "info",
             "run": "-", "date": r[4], "folder": r[3], "fileId": r[0]}
            for r in cur.fetchall()
        ]
    return files + uploads + RECEIVED_FILES


# ── SVC-07 CPQ / ENG-02 Run — 실 파이프라인 (P3-1 · P2-4) ──
from app.services import run_pipeline as rp   # noqa: E402

RUN_TASKS = [
    "BOM 전개 (Code Relationship 재귀)",
    "치수 Macro 평가 (엔진 v1)",
    "도면 생성 (제작 DXF)",
    "원가·견적 (단가 resolve)",
    "견적서 PDF·BOM XLSX 생성",
    "서류·Project Folder 저장 (MinIO)",
]

_runs: dict[int, dict[str, Any]] = {}  # 진행 상태 (산출물·완료는 DB 영속)


class RunRequest(BaseModel):
    runType: str = "ALL"


def _out_row(folder: str, fname: str, ftype: str, file_id: int | None) -> dict[str, Any]:
    meta = {
        "DWG": ("생성", "ok", "미리보기"),
        "PRICE": ("DRAFT", "info", "QCR 발행"),
        "BOM": ("생성", "ok", "ERP 전송"),
        "DATA": ("생성", "ok", None),
    }.get(folder, ("생성", "ok", None))
    return {"folder": folder, "file": fname, "fileType": ftype,
            "status": meta[0], "statusTone": meta[1], "nextAction": meta[2],
            "fileId": file_id}


async def _advance(run_id: int, tid: int, selection_id: int,
                   slot_values: dict[str, str], project_no: str) -> None:
    state = _runs[run_id]
    r = rp.PipelineResult()

    def begin(i: int) -> float:
        state["current"] = i
        state["steps"][i]["status"] = "RUNNING"
        return time.perf_counter()

    def finish(i: int, t0: float, measured: str, warn: bool = False) -> None:
        state["steps"][i]["measured"] = measured
        state["steps"][i]["elapsed"] = f"{time.perf_counter() - t0:.2f}s"
        state["steps"][i]["status"] = "WARN" if warn else "DONE"

    def log(msg: str, level: str = "info") -> None:
        state["logs"].append({
            "time": time.strftime("%H:%M:%S"), "message": msg, "level": level})

    try:
        pool = get_pool()
        with pool.connection() as conn, conn.cursor() as cur:
            # 1. BOM
            t0 = begin(0)
            await asyncio.sleep(0.4)
            m = rp.step_bom(cur, tid, _expand_rows, "KDCR 3-13", slot_values, selection_id, r)
            finish(0, t0, m)
            log(f"BOM expand root=KDCR 3-13 … {len(r.items)} items → cpq_selection_item")

            # 2. 치수 Macro (엔진)
            t0 = begin(1)
            await asyncio.sleep(0.4)
            m = rp.step_dims(cur, tid, _make_table_resolver(cur, tid), r)
            finish(1, t0, m)
            log("dims " + " · ".join(f"{k}={v:g}" for k, v in r.dims.items()))

            # 3. 도면 (DXF)
            t0 = begin(2)
            await asyncio.sleep(0.4)
            m = rp.step_drawing(r)
            finish(2, t0, m)
            log("drawing compose → DWG/ (ezdxf R2010)")

            # 4. 원가
            t0 = begin(3)
            await asyncio.sleep(0.4)
            m = rp.step_pricing(r)
            has_warn = bool(r.warn)
            finish(3, t0, m, warn=has_warn)
            for w in r.warn:
                log(f"warn {w}", "warn")
            log(f"pricing total {r.total_k:,.0f}K · resolve {r.resolved}/{len(r.items)}")

            # 5. 견적서 PDF + BOM XLSX
            t0 = begin(4)
            await asyncio.sleep(0.4)
            m1 = rp.step_quotation(r, project_no)
            m2 = rp.step_bom_xlsx(r)
            finish(4, t0, f"{m1} · {m2}")
            log("quotation PDF (워터마크) + BOM XLSX 생성")

            # 6. 저장 (MinIO + dwg_file + cpq_output)
            t0 = begin(5)
            await asyncio.sleep(0.4)
            file_ids = rp.persist_outputs(cur, tid, run_id, project_no, r)
            finish(5, t0, f"산출물 {len(file_ids)} → MinIO/{project_no}")
            log(f"outputs {len(file_ids)} → Project Folder SUCCESS")

            state["outputs"] = [
                _out_row(folder, fname, ftype, fid)
                for (folder, fname, ftype, _), fid in zip(r.files, file_ids)
            ]
            state["totalK"] = r.total_k
            cur.execute(
                """UPDATE cpq_run SET status='SUCCESS', finished_at=now(),
                   dimension_values=%s WHERE run_id=%s""",
                (json.dumps({"KDCR 3-13": r.dims}), run_id))
        state["status"] = "SUCCESS"
        state["current"] = len(RUN_TASKS)
    except Exception as e:  # noqa: BLE001
        state["status"] = "FAILED"
        log(f"실패: {e}", "warn")
        try:
            pool = get_pool()
            with pool.connection() as conn, conn.cursor() as cur:
                cur.execute(
                    """UPDATE cpq_run SET status='FAILED', finished_at=now(),
                       error_detail=%s WHERE run_id=%s""",
                    (json.dumps({"error": str(e)}), run_id))
        except Exception:  # noqa: BLE001
            pass


@router.post("/cpq/runs", status_code=202)
async def start_run(body: RunRequest) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT s.selection_id, s.slot_values, p.project_no
               FROM cpq_selection s JOIN prj_project p ON p.project_id=s.project_id
               WHERE s.tenant_id=%s ORDER BY s.selection_id LIMIT 1""", (tid,))
        sel = cur.fetchone()
        if not sel:
            raise HTTPException(503, detail="seed selection missing")
        cur.execute(
            """INSERT INTO cpq_run (tenant_id, selection_id, run_type, status)
               VALUES (%s,%s,%s,'RUNNING') RETURNING run_id""",
            (tid, sel[0], body.runType))
        run_id = cur.fetchone()[0]
    _runs[run_id] = {
        "status": "RUNNING", "current": -1, "outputs": [], "logs": [],
        "steps": [
            {"no": i + 1, "task": t, "measured": "—", "elapsed": "", "status": "PENDING"}
            for i, t in enumerate(RUN_TASKS)
        ],
    }
    asyncio.get_running_loop().create_task(
        _advance(run_id, tid, sel[0], sel[1] or {}, sel[2]))
    return {"runId": run_id, "status": "RUNNING", "statusUrl": f"/api/v1/cpq/runs/{run_id}"}


@router.get("/cpq/runs/{run_id}")
def run_status(run_id: int) -> dict[str, Any]:
    state = _runs.get(run_id)
    if state is None:
        # 백엔드 재기동 후 — DB 에서 산출물 복원
        with _conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT status FROM cpq_run WHERE run_id=%s", (run_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, detail=f"run not found: {run_id}")
            cur.execute(
                """SELECT o.output_type, o.data->>'file', o.data->>'fileType', o.file_id
                   FROM cpq_output o WHERE o.run_id=%s ORDER BY o.output_id""", (run_id,))
            outputs = [_out_row(r[0], r[1] or "output", r[2] or "PDF", r[3])
                       for r in cur.fetchall()]
        return {
            "runId": run_id, "status": row[0], "progress": 1.0,
            "steps": [
                {"no": i + 1, "task": t, "measured": "(재기동 — 이력)",
                 "elapsed": "", "status": "DONE"}
                for i, t in enumerate(RUN_TASKS)
            ],
            "outputs": outputs, "logs": [],
        }
    done = state["status"] != "RUNNING"
    cur_i = state["current"]
    progress = 1.0 if done else max(0.0, (cur_i + 0.5) / len(RUN_TASKS))
    return {
        "runId": run_id, "status": state["status"], "progress": progress,
        "steps": state["steps"], "outputs": state["outputs"], "logs": state["logs"],
    }

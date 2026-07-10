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

from fastapi import APIRouter, HTTPException, Request, Response, UploadFile
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

TOKEN_TTL = 8 * 3600        # 발급 수명
RENEW_WINDOW = 30 * 60      # 만료 30분 전부터 응답 헤더로 재발급 (B8 — 하드컷 제거)


def _issue_token(login: str, ttl: int = TOKEN_TTL) -> str:
    exp = int(time.time()) + ttl
    payload = f"{login}.{exp}"
    sig = hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def require_auth(request: Request, response: Response) -> None:
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
    # 슬라이딩 갱신 — 잔여 30분 미만이면 새 토큰을 헤더로 전달 (프론트가 교체)
    if int(exp) - time.time() < RENEW_WINDOW:
        response.headers["X-EDIM-Token"] = _issue_token(login)


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


def _audit(cur, tid: int, target_table: str, target_id: int, action: str,
           actor_id: int, after: dict | None = None, before: dict | None = None) -> None:
    """보안 감사 — sys_history 공통 기록 (SYS-005·B8)."""
    cur.execute(
        """INSERT INTO sys_history (tenant_id, target_table, target_id, action,
                                    actor_id, before_data, after_data)
           VALUES (%s,%s,%s,%s,%s,%s,%s)""",
        (tid, target_table, target_id, action[:20], actor_id,
         json.dumps(before) if before else None,
         json.dumps(after) if after else None))


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


# ── 운영 설정 노출 — 개발서버 전용 기능 게이트 ──
DEV_MODE = os.getenv("EDIM_DEV_MODE", "") == "1"


@router.get("/config")
def app_config() -> dict[str, Any]:
    """프론트 기능 게이트 — devMode 는 개발서버(EDIM_DEV_MODE=1)에서만 true."""
    return {"devMode": DEV_MODE}


# ── 개발서버 전용: 운영자 요구사항 접수 (dev_requirement — 54-테이블 설계 외 운영 도구) ──

def _require_dev_mode() -> None:
    if not DEV_MODE:
        raise HTTPException(404, detail="개발서버 전용 기능입니다")


class DevReqCreate(BaseModel):
    title: str
    content: str = ""
    category: str = "CHANGE"     # CHANGE | BUG | FEATURE
    priority: str = "P2"         # P1 | P2 | P3
    screenId: str = ""


class DevReqPatch(BaseModel):
    status: str                  # OPEN | IN_PROGRESS | DONE | REJECTED
    resolution: str = ""


@router.get("/dev/requirements")
def dev_req_list(status: str = "") -> list[dict[str, Any]]:
    """요구사항 목록 — 전 사용자 조회 가능 (최신 우선, status 필터 옵션)."""
    _require_dev_mode()
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        q = """SELECT r.req_id, r.screen_id, r.category, r.title, r.content, r.priority, r.status,
                      r.requester, COALESCE(r.resolution,''),
                      to_char(r.created_at,'YYYY-MM-DD HH24:MI'),
                      to_char(r.resolved_at,'YYYY-MM-DD HH24:MI'),
                      (SELECT count(*) FROM dev_requirement_image i WHERE i.req_id=r.req_id)
               FROM dev_requirement r WHERE r.tenant_id=%s"""
        args: list[Any] = [tid]
        if status:
            q += " AND r.status=%s"
            args.append(status)
        cur.execute(q + " ORDER BY r.req_id DESC", args)
        return [
            {"reqId": r[0], "screenId": r[1] or "", "category": r[2], "title": r[3],
             "content": r[4], "priority": r[5], "status": r[6], "requester": r[7],
             "resolution": r[8], "createdAt": r[9], "resolvedAt": r[10], "imageCount": r[11]}
            for r in cur.fetchall()
        ]


@router.post("/dev/requirements", status_code=201)
def dev_req_create(request: Request, body: DevReqCreate) -> dict[str, Any]:
    """요구사항 등록 — 로그인한 운영자 누구나 (GENERAL 포함)."""
    _require_dev_mode()
    title = body.title.strip()
    if not title:
        raise HTTPException(422, detail="제목은 필수입니다")
    if body.category not in ("CHANGE", "BUG", "FEATURE"):
        raise HTTPException(422, detail=f"분류 오류: {body.category} (CHANGE|BUG|FEATURE)")
    if body.priority not in ("P1", "P2", "P3"):
        raise HTTPException(422, detail=f"우선순위 오류: {body.priority} (P1|P2|P3)")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """INSERT INTO dev_requirement (tenant_id, screen_id, category, title, content,
               priority, requester) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING req_id""",
            (tid, body.screenId.strip()[:50] or None, body.category, title[:200],
             body.content.strip(), body.priority, request.state.login))
        return {"reqId": cur.fetchone()[0], "status": "OPEN"}


@router.patch("/dev/requirements/{req_id}", dependencies=[SETUP])
def dev_req_update(req_id: int, body: DevReqPatch) -> dict[str, Any]:
    """상태 변경 (SETUP+) — 처리 라운드에서 IN_PROGRESS/DONE/REJECTED 마킹."""
    _require_dev_mode()
    if body.status not in ("OPEN", "IN_PROGRESS", "DONE", "REJECTED"):
        raise HTTPException(422, detail=f"상태 오류: {body.status}")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """UPDATE dev_requirement
               SET status=%s, resolution=NULLIF(%s,''),
                   resolved_at=CASE WHEN %s IN ('DONE','REJECTED') THEN now() ELSE NULL END
               WHERE tenant_id=%s AND req_id=%s RETURNING req_id""",
            (body.status, body.resolution.strip(), body.status, tid, req_id))
        if not cur.fetchone():
            raise HTTPException(404, detail=f"요구사항 없음: #{req_id}")
    return {"reqId": req_id, "status": body.status}


@router.delete("/dev/requirements/{req_id}", dependencies=[SETUP])
def dev_req_delete(req_id: int) -> dict[str, Any]:
    """삭제 (SETUP+) — 첨부 이미지(MinIO 객체 포함)까지 연쇄 정리."""
    _require_dev_mode()
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute("SELECT file_path FROM dev_requirement_image WHERE req_id=%s", (req_id,))
        keys = [r[0] for r in cur.fetchall()]
        cur.execute("DELETE FROM dev_requirement WHERE tenant_id=%s AND req_id=%s RETURNING req_id",
                    (tid, req_id))
        if not cur.fetchone():
            raise HTTPException(404, detail=f"요구사항 없음: #{req_id}")
    for key in keys:  # 이미지 행은 FK CASCADE — 객체는 여기서 제거
        try:
            storage.remove_object(key)
        except RuntimeError:
            pass  # 스토리지 불가 시 orphan (버킷 정리 배치 대상)
    return {"deleted": req_id}


# ── 요구사항 첨부 이미지 — 스크린샷 붙여넣기/업로드 (MinIO dev-req/ prefix) ──

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp")
IMAGE_MAX_BYTES = 10 * 1024 * 1024


@router.post("/dev/requirements/{req_id}/images", status_code=201)
async def dev_req_image_upload(req_id: int, uploadedFile: UploadFile = File(...)) -> dict[str, Any]:
    """이미지 첨부 — 등록자 포함 전 사용자 (OPEN 요구에 스크린샷 추가)."""
    _require_dev_mode()
    fname = (uploadedFile.filename or "image.png").replace("/", "_")
    if not fname.lower().endswith(IMAGE_EXTS):
        raise HTTPException(422, detail=f"이미지 파일만 첨부 가능: {fname} (png/jpg/gif/webp)")
    data = await uploadedFile.read()
    if len(data) > IMAGE_MAX_BYTES:
        raise HTTPException(413, detail="10MB 초과")
    if not data:
        raise HTTPException(422, detail="빈 파일")
    ctype = uploadedFile.content_type or "image/png"
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute("SELECT 1 FROM dev_requirement WHERE tenant_id=%s AND req_id=%s", (tid, req_id))
        if not cur.fetchone():
            raise HTTPException(404, detail=f"요구사항 없음: #{req_id}")
        cur.execute(
            """INSERT INTO dev_requirement_image (req_id, file_name, file_path, file_size, content_type)
               VALUES (%s,%s,%s,%s,%s) RETURNING image_id""",
            (req_id, fname[:200], "", len(data), ctype[:60]))
        image_id = cur.fetchone()[0]
        key = f"dev-req/{req_id}/{image_id}_{fname}"
        cur.execute("UPDATE dev_requirement_image SET file_path=%s WHERE image_id=%s", (key, image_id))
    try:
        storage.put_object(key, data, ctype)
    except RuntimeError:
        with _conn() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM dev_requirement_image WHERE image_id=%s", (image_id,))
        raise HTTPException(503, detail="storage unavailable")
    return {"imageId": image_id, "fileName": fname, "size": len(data)}


@router.get("/dev/requirements/{req_id}/images")
def dev_req_image_list(req_id: int) -> list[dict[str, Any]]:
    _require_dev_mode()
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT image_id, file_name, file_size, content_type
               FROM dev_requirement_image WHERE req_id=%s ORDER BY image_id""", (req_id,))
        return [{"imageId": r[0], "fileName": r[1], "size": r[2], "contentType": r[3]}
                for r in cur.fetchall()]


@router.get("/dev/requirements/images/{image_id}")
def dev_req_image_get(image_id: int) -> StreamingResponse:
    """이미지 바이트 스트림 — 프론트는 authorized fetch → blob URL 로 표시."""
    _require_dev_mode()
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT file_path, content_type FROM dev_requirement_image WHERE image_id=%s", (image_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, detail=f"이미지 없음: #{image_id}")
    try:
        obj = storage.get_object(row[0])
    except RuntimeError:
        raise HTTPException(503, detail="storage unavailable")
    return StreamingResponse(obj.stream(64 * 1024), media_type=row[1])


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
MAX_LOGIN_FAILS = 5   # 연속 실패 → 자동 LOCKED (B8, SEC-002)


class LoginRequest(BaseModel):
    userId: str
    password: str
    ttlSeconds: int | None = None   # 토큰 수명 단축 (갱신 검증용, 60s~8h 클램프)


@router.post("/auth/login")
def login(body: LoginRequest) -> dict[str, Any]:
    login_id = body.userId.strip()
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT user_id, user_name, department, user_level, password_hash, status
               FROM sys_user WHERE tenant_id=%s AND login_id=%s""", (tid, login_id))
        row = cur.fetchone()
        if not row:
            # 미존재 사용자 — sys_history.actor_id FK 로 기록 불가, 정보 노출 방지 위해 동일 메시지
            raise HTTPException(401, detail="사번 또는 비밀번호가 올바르지 않습니다")
        uid, status = row[0], row[5]
        if status == "LOCKED":
            _audit(cur, tid, "sys_user", uid, "LOGIN_DENY", uid, {"reason": "LOCKED"})
            raise HTTPException(403, detail="계정 잠금(LOCKED) — 관리자에게 잠금 해제를 요청하십시오")
        if status != "ACTIVE":
            raise HTTPException(401, detail="사번 또는 비밀번호가 올바르지 않습니다")
        if hashlib.sha256(body.password.encode()).hexdigest() != row[4]:
            _audit(cur, tid, "sys_user", uid, "LOGIN_FAIL", uid, {"login": login_id})
            # 마지막 성공/잠금해제 이후 연속 실패 수 — 도달 시 자동 잠금
            cur.execute(
                """SELECT count(*) FROM sys_history
                   WHERE tenant_id=%s AND target_table='sys_user' AND target_id=%s
                     AND action='LOGIN_FAIL'
                     AND acted_at > COALESCE(
                       (SELECT max(acted_at) FROM sys_history
                        WHERE tenant_id=%s AND target_table='sys_user' AND target_id=%s
                          AND action IN ('LOGIN_OK','UNLOCK')), '-infinity')""",
                (tid, uid, tid, uid))
            fails = cur.fetchone()[0]
            if fails >= MAX_LOGIN_FAILS:
                cur.execute(
                    "UPDATE sys_user SET status='LOCKED', updated_at=now() WHERE user_id=%s", (uid,))
                _audit(cur, tid, "sys_user", uid, "LOCK", uid,
                       {"reason": f"로그인 {fails}회 연속 실패 자동 잠금"})
                raise HTTPException(
                    403, detail=f"로그인 {MAX_LOGIN_FAILS}회 실패 — 계정이 잠겼습니다 (관리자 잠금 해제 필요)")
            raise HTTPException(
                401, detail=f"사번 또는 비밀번호가 올바르지 않습니다 (실패 {fails}/{MAX_LOGIN_FAILS})")
        _audit(cur, tid, "sys_user", uid, "LOGIN_OK", uid, {"login": login_id})
    ttl = max(60, min(int(body.ttlSeconds or TOKEN_TTL), TOKEN_TTL))
    return {
        "token": _issue_token(login_id, ttl),
        "user": {
            "userId": login_id, "name": row[1], "department": row[2] or "",
            "userLevel": row[3], "tenantId": TENANT,
        },
    }


class PasswordChangeRequest(BaseModel):
    currentPassword: str
    newPassword: str


@router.put("/users/me/password")
def change_my_password(request: Request, body: PasswordChangeRequest) -> dict[str, Any]:
    """비밀번호 변경 (B8, SEC-001) — 현재 비밀번호 검증 후 교체 + 감사."""
    new = body.newPassword
    if len(new) < 4:
        raise HTTPException(422, detail="새 비밀번호는 4자 이상이어야 합니다")
    if new == body.currentPassword:
        raise HTTPException(422, detail="새 비밀번호가 현재 비밀번호와 같습니다")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        uid = request.state.user_id
        cur.execute("SELECT password_hash FROM sys_user WHERE user_id=%s", (uid,))
        row = cur.fetchone()
        if hashlib.sha256(body.currentPassword.encode()).hexdigest() != row[0]:
            _audit(cur, tid, "sys_user", uid, "PW_CHANGE_FAIL", uid,
                   {"reason": "현재 비밀번호 불일치"})
            raise HTTPException(403, detail="현재 비밀번호가 올바르지 않습니다")
        cur.execute(
            """UPDATE sys_user SET password_hash=%s, updated_by=%s, updated_at=now()
               WHERE user_id=%s""",
            (hashlib.sha256(new.encode()).hexdigest(), request.state.login, uid))
        _audit(cur, tid, "sys_user", uid, "PW_CHANGE", uid)   # 비밀번호 자체는 기록하지 않음
    return {"login": request.state.login, "changed": True}


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


# ── B10 — C-1 마감: 견적 미리보기 PDF · 사양 Excel Import (CPQ-002) ──

class QuotePreview(BaseModel):
    rootCode: str = "KDCR 3-13"
    slotValues: dict[str, str] = {}


@router.post("/cpq/quote-preview.pdf", dependencies=[SETUP])
def quote_preview(body: QuotePreview) -> Any:
    """견적 미리보기 — 현재 슬롯 선택으로 BOM 전개+단가 후 견적서 PDF 즉석 렌더 (영속 없음)."""
    from types import SimpleNamespace

    from fastapi.responses import Response

    from ..services import run_pipeline as rp
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        rows = _expand_rows(cur, tid, body.rootCode, body.slotValues)
    if not rows:
        raise HTTPException(404, detail=f"root code not found: {body.rootCode}")
    items = [{
        "resolvedCode": _resolved(r[0], r[4] or {}), "name": r[1],
        "quantity": float(r[2]),
        "priceK": round(float(r[6]) / 1000) if r[6] is not None else None,
    } for r in rows]
    total_k = sum((i["priceK"] or 0) * i["quantity"] for i in items)
    ns = SimpleNamespace(items=items, total_k=total_k, files=[])
    rp.step_quotation(ns, "PS-61313-5 · 미리보기")
    return Response(content=ns.files[-1][3], media_type="application/pdf",
                    headers={"Content-Disposition": "inline; filename=\"quote-preview.pdf\""})


@router.post("/cpq/spec-import", dependencies=[SETUP])
async def spec_import(uploadedFile: UploadFile = File(...)) -> dict[str, Any]:
    """사양 Excel Import — 헤더 Slot·Value 2열 → slotValues (CPQ-002)."""
    import openpyxl
    data = await uploadedFile.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    except Exception:  # noqa: BLE001
        raise HTTPException(422, detail="Excel 파일이 아닙니다 (.xlsx)")
    ws = wb.active
    header = [str(c.value).strip() if c.value is not None else "" for c in ws[1]]
    if "Slot" not in header or "Value" not in header:
        raise HTTPException(422, detail="헤더 불일치 — 필요 열: Slot·Value")
    si, vi = header.index("Slot"), header.index("Value")
    sv: dict[str, str] = {}
    for row in ws.iter_rows(min_row=2):
        s, v = row[si].value, row[vi].value
        if s is None or v is None:
            continue
        sv[str(s).strip().upper()[:5]] = str(v).strip()
    if not sv:
        raise HTTPException(422, detail="유효한 Slot·Value 행 없음")
    return {"slotValues": sv}


# ── B13 — Arrangement Set-Up (M-4-2) · Templet 관리 (S-2-3) ──

@router.get("/arrangements")
def arrangements() -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT a.arrangement_code, a.arrangement_name, a.product_family,
                      COALESCE(a.direction_option,''), COALESCE(a.install_option,''),
                      a.approval_status,
                      (SELECT count(*) FROM arrangement_component c
                        WHERE c.arrangement_id=a.arrangement_id)
               FROM arrangement_code a WHERE a.tenant_id=%s ORDER BY a.arrangement_id""", (tid,))
        return [
            {"code": r[0], "name": r[1], "family": r[2], "direction": r[3],
             "install": r[4], "status": r[5], "components": int(r[6])}
            for r in cur.fetchall()
        ]


@router.get("/arrangements/{code}/components")
def arrangement_components(code: str) -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT COALESCE(c.position_key,''), pc.main_code, pc.code_name, c.quantity
               FROM arrangement_component c
               JOIN arrangement_code a ON a.arrangement_id=c.arrangement_id
               JOIN product_code pc ON pc.product_code_id=c.product_code_id
               WHERE a.tenant_id=%s AND a.arrangement_code=%s ORDER BY c.sort_order""",
            (tid, code))
        return [
            {"position": r[0], "code": r[1], "name": r[2], "quantity": float(r[3])}
            for r in cur.fetchall()
        ]


class ArrangementCreate(BaseModel):
    code: str
    name: str
    family: str = "AHU"
    direction: str = ""
    install: str = ""


@router.post("/arrangements", status_code=201, dependencies=[SETUP])
def create_arrangement(request: Request, body: ArrangementCreate) -> dict[str, Any]:
    if not body.code.strip() or not body.name.strip():
        raise HTTPException(422, detail="필수(노란 셀) — Code·명칭")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT 1 FROM arrangement_code WHERE tenant_id=%s AND arrangement_code=%s",
            (tid, body.code.strip()))
        if cur.fetchone():
            raise HTTPException(409, detail=f"중복 — Arrangement {body.code} 이미 등록됨")
        cur.execute(
            """INSERT INTO arrangement_code (tenant_id, arrangement_code, arrangement_name,
               product_family, direction_option, install_option)
               VALUES (%s,%s,%s,%s,NULLIF(%s,''),NULLIF(%s,'')) RETURNING arrangement_id""",
            (tid, body.code.strip(), body.name.strip(), body.family.strip()[:50],
             body.direction.strip(), body.install.strip()))
        arr_id = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO sys_approval_request (tenant_id, target_table, target_id,
               request_type, step, requester_id, comment)
               VALUES (%s,'arrangement_code',%s,'CREATE','승인',%s,%s)""",
            (tid, arr_id, request.state.user_id,
             f"Arrangement 등록 — {body.code} {body.name}"[:200]))
    return {"arrangementId": arr_id, "status": "DRAFT"}


class ComponentAdd(BaseModel):
    productCode: str
    position: str = ""
    quantity: float = 1


@router.post("/arrangements/{code}/components", status_code=201, dependencies=[SETUP])
def add_arrangement_component(code: str, body: ComponentAdd) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT arrangement_id FROM arrangement_code WHERE tenant_id=%s AND arrangement_code=%s",
            (tid, code))
        a = cur.fetchone()
        if not a:
            raise HTTPException(404, detail=f"Arrangement 없음: {code}")
        cur.execute(
            "SELECT product_code_id FROM product_code WHERE tenant_id=%s AND main_code=%s",
            (tid, body.productCode.strip()))
        pc = cur.fetchone()
        if not pc:
            raise HTTPException(404, detail=f"코드 없음: {body.productCode}")
        cur.execute(
            """INSERT INTO arrangement_component (arrangement_id, product_code_id,
               position_key, quantity, sort_order)
               VALUES (%s,%s,NULLIF(%s,''),%s,
                       (SELECT COALESCE(max(sort_order),0)+1 FROM arrangement_component
                         WHERE arrangement_id=%s))
               RETURNING component_id""",
            (a[0], pc[0], body.position.strip()[:30], body.quantity, a[0]))
        cid = cur.fetchone()[0]
    return {"componentId": cid}


@router.get("/toolbox/templets")
def templets() -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT templet_name, templet_type, definition, approval_status, is_system
               FROM tbx_templet WHERE tenant_id=%s ORDER BY templet_id""", (tid,))
        return [
            {"name": r[0], "templetType": r[1], "definition": r[2],
             "status": r[3], "system": bool(r[4])}
            for r in cur.fetchall()
        ]


class TempletSave(BaseModel):
    templetType: str = "COMMAND"
    definition: dict[str, Any] = {}


@router.put("/toolbox/templets/{name}", dependencies=[SETUP])
def save_templet(name: str, body: TempletSave) -> dict[str, Any]:
    """Templet upsert — 저장 시 DRAFT 로 회귀 (승인은 POST /approvals)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """UPDATE tbx_templet SET definition=%s, templet_type=%s,
               approval_status='DRAFT', updated_at=now()
               WHERE tenant_id=%s AND templet_name=%s RETURNING templet_id""",
            (json.dumps(body.definition), body.templetType.strip()[:30], tid, name))
        row = cur.fetchone()
        if not row:
            cur.execute(
                """INSERT INTO tbx_templet (tenant_id, templet_name, templet_type, definition)
                   VALUES (%s,%s,%s,%s) RETURNING templet_id""",
                (tid, name, body.templetType.strip()[:30] or "COMMAND",
                 json.dumps(body.definition)))
            row = cur.fetchone()
    return {"templetId": row[0], "status": "DRAFT"}


# ── B13-2 — Variant·Constant (S-1-2) · Raw Material·GPI (M-3-2) · Quality (M-4-5) ──

@router.get("/codes/values")
def code_values(group: str = "KOF") -> list[dict[str, Any]]:
    """그룹 슬롯별 값 목록 — code_item + code_item_value (S-1-2)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT i.item_slot, i.item_name, v.value_code, COALESCE(v.value_name,''),
                      v.approval_status
               FROM code_item i
               JOIN code_group g ON g.group_id=i.group_id
               LEFT JOIN code_item_value v ON v.item_id=i.item_id
               WHERE i.tenant_id=%s AND g.group_code=%s
               ORDER BY i.item_slot, v.sort_order""", (tid, group))
        return [
            {"slot": r[0], "itemName": r[1], "valueCode": r[2] or "", "valueName": r[3],
             "status": r[4] or "-"}
            for r in cur.fetchall()
        ]


class ValueAdd(BaseModel):
    group: str = "KOF"
    slot: str
    valueCode: str
    valueName: str = ""


@router.post("/codes/values", status_code=201, dependencies=[SETUP])
def add_code_value(request: Request, body: ValueAdd) -> dict[str, Any]:
    """슬롯 값 추가 — PENDING + 승인 요청 자동 (add_item 패턴)."""
    if not body.slot.strip() or not body.valueCode.strip():
        raise HTTPException(422, detail="필수(노란 셀) — Slot·값 코드")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT i.item_id FROM code_item i
               JOIN code_group g ON g.group_id=i.group_id
               WHERE i.tenant_id=%s AND g.group_code=%s AND i.item_slot=%s""",
            (tid, body.group, body.slot.strip().upper()))
        item = cur.fetchone()
        if not item:
            raise HTTPException(404, detail=f"Slot 없음: {body.group}/{body.slot}")
        cur.execute(
            "SELECT 1 FROM code_item_value WHERE item_id=%s AND value_code=%s",
            (item[0], body.valueCode.strip()[:30]))
        if cur.fetchone():
            raise HTTPException(409, detail=f"중복 — 값 {body.valueCode} 이미 등록됨")
        cur.execute(
            """INSERT INTO code_item_value (tenant_id, item_id, value_code, value_name,
               approval_status, sort_order)
               VALUES (%s,%s,%s,NULLIF(%s,''),'PENDING',
                       (SELECT COALESCE(max(sort_order),0)+1 FROM code_item_value WHERE item_id=%s))
               RETURNING value_id""",
            (tid, item[0], body.valueCode.strip()[:30], body.valueName.strip()[:100], item[0]))
        vid = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO sys_approval_request (tenant_id, target_table, target_id,
               request_type, step, requester_id, comment)
               VALUES (%s,'code_item_value',%s,'CREATE','승인',%s,%s)""",
            (tid, vid, request.state.user_id,
             f"슬롯 값 등록 — {body.group}/{body.slot} {body.valueCode}"[:200]))
    return {"valueId": vid, "status": "PENDING"}


@router.get("/materials")
def materials() -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT material_code, material_name, material_type,
                      density, COALESCE(standard,''), COALESCE(hazard_class,'')
               FROM mat_material WHERE tenant_id=%s ORDER BY material_id""", (tid,))
        return [
            {"code": r[0], "name": r[1], "materialType": r[2],
             "density": float(r[3]) if r[3] is not None else None,
             "standard": r[4], "hazard": r[5]}
            for r in cur.fetchall()
        ]


class MaterialCreate(BaseModel):
    code: str
    name: str
    materialType: str = "STEEL"
    density: float | None = None
    standard: str = ""
    hazard: str = ""


@router.post("/materials", status_code=201, dependencies=[SETUP])
def create_material(body: MaterialCreate) -> dict[str, Any]:
    if not body.code.strip() or not body.name.strip():
        raise HTTPException(422, detail="필수(노란 셀) — 재질 코드·명")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT 1 FROM mat_material WHERE tenant_id=%s AND material_code=%s",
            (tid, body.code.strip()))
        if cur.fetchone():
            raise HTTPException(409, detail=f"중복 — 재질 {body.code} 이미 등록됨")
        cur.execute(
            """INSERT INTO mat_material (tenant_id, material_code, material_name,
               material_type, density, standard, hazard_class)
               VALUES (%s,%s,%s,%s,%s,NULLIF(%s,''),NULLIF(%s,'')) RETURNING material_id""",
            (tid, body.code.strip()[:30], body.name.strip()[:100],
             body.materialType.strip()[:20], body.density,
             body.standard.strip()[:30], body.hazard.strip()[:30]))
        mid = cur.fetchone()[0]
    return {"materialId": mid}


@router.get("/drawings/{drawing_no}/verifications")
def drawing_verifications(drawing_no: str) -> list[dict[str, Any]]:
    """검증 Macro 규칙 — dwg_verification (Quality M-4-5)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT v.rule_name, m.macro_name, v.warning_message, v.is_active
               FROM dwg_verification v
               JOIN dwg_drawing d ON d.drawing_id=v.drawing_id
               JOIN tbx_macro m ON m.macro_id=v.macro_id
               WHERE v.tenant_id=%s AND d.drawing_no=%s ORDER BY v.verification_id""",
            (tid, drawing_no))
        return [
            {"rule": r[0], "macro": r[1], "warning": r[2], "active": bool(r[3])}
            for r in cur.fetchall()
        ]


class VerificationAdd(BaseModel):
    ruleName: str
    macroName: str
    warning: str


@router.post("/drawings/{drawing_no}/verifications", status_code=201, dependencies=[SETUP])
def add_drawing_verification(drawing_no: str, body: VerificationAdd) -> dict[str, Any]:
    if not body.ruleName.strip() or not body.warning.strip():
        raise HTTPException(422, detail="필수(노란 셀) — 규칙명·경고 문구")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT drawing_id FROM dwg_drawing WHERE tenant_id=%s AND drawing_no=%s LIMIT 1",
            (tid, drawing_no))
        d = cur.fetchone()
        if not d:
            raise HTTPException(404, detail=f"도면 없음: {drawing_no}")
        cur.execute(
            "SELECT macro_id FROM tbx_macro WHERE tenant_id=%s AND macro_name=%s",
            (tid, body.macroName.strip()))
        m = cur.fetchone()
        if not m:
            raise HTTPException(404, detail=f"Macro 없음: {body.macroName}")
        cur.execute(
            """INSERT INTO dwg_verification (tenant_id, drawing_id, rule_name, macro_id,
               warning_message) VALUES (%s,%s,%s,%s,%s) RETURNING verification_id""",
            (tid, d[0], body.ruleName.strip()[:100], m[0], body.warning.strip()[:500]))
        vid = cur.fetchone()[0]
    return {"verificationId": vid}


# ── B14 — 마스터 데이터 (com_company) · RBAC 동적화 (sys_role) · Hierarchy ──

@router.get("/companies")
def companies() -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT company_name, company_type, COALESCE(nation,''),
                      COALESCE(evaluation_grade,''), COALESCE(payment_terms,'')
               FROM com_company WHERE tenant_id=%s ORDER BY company_id""", (tid,))
        return [
            {"name": r[0], "companyType": r[1], "nation": r[2], "grade": r[3], "terms": r[4]}
            for r in cur.fetchall()
        ]


class CompanyCreate(BaseModel):
    name: str
    companyType: str = "SUPPLIER"
    nation: str = ""
    grade: str = ""
    terms: str = ""


@router.post("/companies", status_code=201, dependencies=[SETUP])
def create_company(body: CompanyCreate) -> dict[str, Any]:
    if not body.name.strip():
        raise HTTPException(422, detail="필수(노란 셀) — 업체명")
    ctype = body.companyType.strip().upper()
    if ctype not in ("CUSTOMER", "SUPPLIER", "PARTNER", "BANK"):
        raise HTTPException(422, detail=f"유형 오류: {body.companyType}")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT 1 FROM com_company WHERE tenant_id=%s AND company_name=%s",
            (tid, body.name.strip()))
        if cur.fetchone():
            raise HTTPException(409, detail=f"중복 — 업체 {body.name} 이미 등록됨")
        cur.execute(
            """INSERT INTO com_company (tenant_id, company_name, company_type, nation,
               evaluation_grade, payment_terms)
               VALUES (%s,%s,%s,NULLIF(%s,''),NULLIF(%s,''),NULLIF(%s,'')) RETURNING company_id""",
            (tid, body.name.strip()[:200], ctype, body.nation.strip()[:50],
             body.grade.strip()[:10], body.terms.strip()[:200]))
        cid = cur.fetchone()[0]
    return {"companyId": cid}


@router.get("/roles")
def roles() -> list[dict[str, Any]]:
    """역할 + 권한 매트릭스 — sys_role/sys_role_permission (M-14-6 실데이터)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT r.role_id, r.role_name, COALESCE(r.description,'')
               FROM sys_role r WHERE r.tenant_id=%s ORDER BY r.role_id""", (tid,))
        out = [{"name": r[1], "description": r[2], "_id": r[0]} for r in cur.fetchall()]
        for role in out:
            cur.execute(
                """SELECT resource_key, action FROM sys_role_permission
                   WHERE role_id=%s ORDER BY resource_key""", (role["_id"],))
            perms: dict[str, str] = {}
            for key, action in cur.fetchall():
                # WRITE 가 READ 를 포함 — 셀 표기는 최상위 권한
                if perms.get(key) != "WRITE":
                    perms[key] = action
            role["permissions"] = perms
            del role["_id"]
    return out


class RolePermissions(BaseModel):
    permissions: dict[str, str] = {}   # resource_key(screenId) -> 'READ'|'WRITE'|'NONE'


@router.put("/roles/{role_name}/permissions", dependencies=[SETUP])
def set_role_permissions(role_name: str, request: Request, body: RolePermissions) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT role_id FROM sys_role WHERE tenant_id=%s AND role_name=%s",
            (tid, role_name))
        role = cur.fetchone()
        if not role:
            raise HTTPException(404, detail=f"역할 없음: {role_name}")
        n = 0
        for key, action in body.permissions.items():
            act = action.strip().upper()
            cur.execute(
                "DELETE FROM sys_role_permission WHERE role_id=%s AND resource_key=%s",
                (role[0], key[:200]))
            if act in ("READ", "WRITE"):
                cur.execute(
                    """INSERT INTO sys_role_permission (role_id, resource_type, resource_key, action)
                       VALUES (%s,'MENU',%s,%s)""", (role[0], key[:200], act))
            n += 1
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'sys_role_permission',%s,'PERM_CHANGE',%s,%s)""",
            (tid, role[0], request.state.user_id, json.dumps(body.permissions)))
    return {"role": role_name, "updated": n}


@router.get("/hierarchy")
def hierarchy(treeType: str = "PRODUCT") -> list[dict[str, Any]]:
    """Hierarchy 주소 체계 — tbx_macro/tbl 의 hierarchy_address 원천 (M-3-1)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT hierarchy_id, parent_id, node_name, COALESCE(symbol,''),
                      address, approval_status
               FROM sys_hierarchy WHERE tenant_id=%s AND tree_type=%s
               ORDER BY sort_order, hierarchy_id""", (tid, treeType.strip().upper()))
        return [
            {"id": r[0], "parentId": r[1], "name": r[2], "symbol": r[3],
             "address": r[4], "status": r[5]}
            for r in cur.fetchall()
        ]


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
    # 실행 파일 차단 (B15 — 업로드 에러 케이스)
    blocked = (".exe", ".bat", ".cmd", ".msi", ".scr", ".ps1", ".sh", ".dll", ".com")
    if (uploadedFile.filename or "").lower().endswith(blocked):
        raise HTTPException(422, detail=f"허용되지 않는 파일 형식: {uploadedFile.filename}")
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


@router.delete("/files/{file_id}", dependencies=[SETUP])
def delete_file(file_id: int, request: Request) -> dict[str, Any]:
    """파일 삭제 — Run 산출물·견적서가 참조 중이면 409 (MinIO 객체 + dwg_file 행 제거)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT file_path, file_name FROM dwg_file WHERE tenant_id=%s AND file_id=%s",
            (tid, file_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"file not found: {file_id}")
        cur.execute("SELECT 1 FROM cpq_output WHERE file_id=%s LIMIT 1", (file_id,))
        if cur.fetchone():
            raise HTTPException(409, detail="Run 산출물이 참조하는 파일은 삭제 불가")
        cur.execute("SELECT 1 FROM cst_quotation WHERE doc_file_id=%s LIMIT 1", (file_id,))
        if cur.fetchone():
            raise HTTPException(409, detail="견적서가 참조하는 파일은 삭제 불가")
        cur.execute("DELETE FROM dwg_file WHERE tenant_id=%s AND file_id=%s", (tid, file_id))
        # 동일 key 를 공유하는 다른 행(재업로드 덮어쓰기)이 남아 있으면 객체는 보존
        cur.execute("SELECT 1 FROM dwg_file WHERE tenant_id=%s AND file_path=%s LIMIT 1",
                    (tid, row[0]))
        key_shared = cur.fetchone() is not None
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'dwg_file',%s,'DELETE',%s,%s)""",
            (tid, file_id, request.state.user_id, json.dumps({"fileName": row[1]})))
    if not key_shared:
        try:
            storage.remove_object(row[0])
        except RuntimeError:
            pass  # 스토리지 불가 시 DB 정리만 — 객체는 orphan (버킷 정리 배치 대상)
    return {"deleted": file_id}


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


@router.post("/notifications/read-all")
def read_all_notifications(request: Request) -> dict[str, Any]:
    """모두 읽음 (B6)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """UPDATE sys_notification SET is_read=true
               WHERE tenant_id=%s AND user_id=%s AND is_read=false""",
            (tid, request.state.user_id))
        n = cur.rowcount
    return {"read": n}


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


@router.delete("/documents/{doc_no}", dependencies=[SETUP])
def document_delete(doc_no: str, request: Request) -> dict[str, Any]:
    """문서 삭제 — SET_UP(작성 중) 상태 한정 (승인/발행 문서 보호). 최신 행 기준."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT doc_control_id, released_status FROM doc_control
               WHERE tenant_id=%s AND doc_no=%s ORDER BY doc_control_id DESC LIMIT 1""",
            (tid, doc_no))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"문서 없음: {doc_no}")
        if row[1] != "SET_UP":
            raise HTTPException(409, detail=f"SET_UP 문서만 삭제 가능 (현재 {row[1]})")
        cur.execute("DELETE FROM doc_control WHERE doc_control_id=%s", (row[0],))
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'doc_control',%s,'DELETE',%s,%s)""",
            (tid, row[0], request.state.user_id, json.dumps({"docNo": doc_no})))
    return {"deleted": doc_no}


# ── B4 — 문서 등록 + Grade 워터마크 PDF 렌더 (SVC-11 · DOC-002) ──

class DocCreate(BaseModel):
    docNo: str
    title: str
    docType: str = "TECH_DOC"
    grade: str = "S-3"


@router.post("/documents", status_code=201, dependencies=[SETUP])
def create_document(request: Request, body: DocCreate) -> dict[str, Any]:
    if not body.docNo.strip() or not body.title.strip():
        raise HTTPException(422, detail="필수(노란 셀) — DOC No·제목")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT 1 FROM doc_control WHERE tenant_id=%s AND doc_no=%s", (tid, body.docNo.strip()))
        if cur.fetchone():
            raise HTTPException(409, detail=f"중복 — DOC No {body.docNo} 이미 등록됨")
        cur.execute("SELECT user_name FROM sys_user WHERE user_id=%s", (request.state.user_id,))
        person = (cur.fetchone() or ["-"])[0]
        cur.execute(
            """INSERT INTO doc_control (tenant_id, doc_no, title, doc_type, released_status,
               version, person, management_grade)
               VALUES (%s,%s,%s,%s,'SET_UP','KD-0.1',%s,%s) RETURNING doc_control_id""",
            (tid, body.docNo.strip(), body.title.strip(), body.docType.strip()[:20],
             person, body.grade.strip()[:10]))
        doc_id = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO sys_approval_request (tenant_id, target_table, target_id,
               request_type, step, requester_id, comment)
               VALUES (%s,'doc_control',%s,'CREATE','승인',%s,%s)""",
            (tid, doc_id, request.state.user_id, f"문서 등록 — {body.docNo} {body.title}"[:200]))
    return {"docId": doc_id, "status": "Set-up"}


@router.get("/documents/{doc_no}/render.pdf")
def render_document(doc_no: str) -> Any:
    """문서 PDF 실렌더 — Grade S-1/S-2 는 CONFIDENTIAL 워터마크 강제 (DOC-002)."""
    from ..services import run_pipeline as rp
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT title, doc_type, released_status, version, person, management_grade,
                      to_char(created_at,'YYYY-MM-DD')
               FROM doc_control WHERE tenant_id=%s AND doc_no=%s
               ORDER BY doc_control_id DESC LIMIT 1""", (tid, doc_no))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"문서 없음: {doc_no}")
    title, dtype, status, ver, person, grade, cdate = row
    watermark = grade in ("S-1", "S-2")
    pdf = rp.build_doc_pdf(
        doc_no=doc_no, title=title, doc_type=dtype, status=STATUS_LABEL.get(status, status),
        version=ver, person=person or "-", grade=grade or "-", created=cdate,
        confidential=watermark)
    from fastapi.responses import Response
    return Response(content=pdf, media_type="application/pdf", headers={
        "Content-Disposition": f"inline; filename=\"{doc_no}.pdf\"",
    })


class RenderRequest(BaseModel):
    title: str
    subtitle: str = ""
    lines: list[str] = []
    confidential: bool = False


@router.post("/render/pdf", dependencies=[SETUP])
def render_generic_pdf(body: RenderRequest) -> Any:
    """범용 PDF 렌더 (SVC-11) — Print Set-up Test 출력·Doc Templet Print."""
    from fastapi.responses import Response

    from ..services import run_pipeline as rp
    pdf = rp.build_lines_pdf(
        title=body.title.strip() or "EDIM 출력", subtitle=body.subtitle.strip(),
        lines=body.lines, confidential=body.confidential)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": "inline; filename=\"edim-print.pdf\""})


# ── SVC-01 Users (M-14-6) ──
ROLE_LABEL ={"PLATFORM": "Platform", "ADMIN": "관리자", "SETUP": "설계 Set-up", "GENERAL": "일반"}


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
def unlock_user(login: str, request: Request) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """UPDATE sys_user SET status='ACTIVE', updated_by=%s, updated_at=now()
               WHERE tenant_id=%s AND login_id=%s AND status='LOCKED'
               RETURNING user_id""", (request.state.login, tid, login))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"LOCKED 계정 아님: {login}")
        _audit(cur, tid, "sys_user", row[0], "UNLOCK", request.state.user_id,
               {"login": login})   # 잠금 해제 = 실패 카운터 초기화 기준점 (B8)
    return {"login": login, "status": "ACTIVE"}


class LevelChangeRequest(BaseModel):
    level: str


@router.patch("/users/{login}/level", dependencies=[ADMIN])
def change_user_level(login: str, request: Request, body: LevelChangeRequest) -> dict[str, Any]:
    """권한 레벨 변경 (B8 감사 확장) — before/after 를 sys_history 에 기록."""
    level = body.level.strip().upper()
    if level not in LEVEL_RANK:
        raise HTTPException(422, detail=f"레벨은 {'/'.join(LEVEL_RANK)} 중 하나여야 합니다")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT user_id, user_level FROM sys_user WHERE tenant_id=%s AND login_id=%s",
            (tid, login))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"사용자 없음: {login}")
        if row[1] == level:
            raise HTTPException(409, detail=f"{login} 은 이미 {level} 입니다")
        cur.execute(
            """UPDATE sys_user SET user_level=%s, updated_by=%s, updated_at=now()
               WHERE user_id=%s""", (level, request.state.login, row[0]))
        _audit(cur, tid, "sys_user", row[0], "LEVEL_CHANGE", request.state.user_id,
               after={"level": level}, before={"level": row[1]})
    return {"login": login, "level": level}


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


# ── B6 — 이벤트 재배정·에스컬레이션 ──

class ReassignRequest(BaseModel):
    assignee: str      # login_id
    comment: str = ""


@router.patch("/erp/events/{event_id}", dependencies=[SETUP])
def reassign_event(event_id: int, request: Request, body: ReassignRequest) -> dict[str, Any]:
    """재배정 — 담당자 변경 + 새 담당자 알림 + 이력 (ERP-031)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT user_id, user_name FROM sys_user WHERE tenant_id=%s AND login_id=%s",
            (tid, body.assignee.strip()))
        u = cur.fetchone()
        if not u:
            raise HTTPException(404, detail=f"사용자 없음: {body.assignee}")
        cur.execute(
            """UPDATE erp_process_event SET assignee_id=%s,
               data=COALESCE(data,'{}'::jsonb) || %s::jsonb
               WHERE tenant_id=%s AND event_id=%s RETURNING event_id""",
            (u[0], json.dumps({"reassign": body.comment or body.assignee}), tid, event_id))
        if not cur.fetchone():
            raise HTTPException(404, detail=f"이벤트 없음: {event_id}")
        _notify(cur, tid, u[0], "TASK_ASSIGNED", f"업무 재배정 — 이벤트 #{event_id}", "/common")
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'erp_process_event',%s,'REASSIGN',%s,%s)""",
            (tid, event_id, request.state.user_id,
             json.dumps({"assignee": body.assignee, "comment": body.comment})))
    return {"eventId": event_id, "assignee": u[1]}


class EscalateRequest(BaseModel):
    reason: str = ""


@router.post("/erp/events/{event_id}/escalate", dependencies=[SETUP])
def escalate_event(event_id: int, request: Request, body: EscalateRequest) -> dict[str, Any]:
    """에스컬레이션 — ADMIN 전원 알림 + 이력 (이상 경고 상위 보고)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT 1 FROM erp_process_event WHERE tenant_id=%s AND event_id=%s", (tid, event_id))
        if not cur.fetchone():
            raise HTTPException(404, detail=f"이벤트 없음: {event_id}")
        cur.execute(
            """SELECT user_id FROM sys_user
               WHERE tenant_id=%s AND user_level IN ('ADMIN','PLATFORM')""", (tid,))
        n = 0
        for (uid,) in cur.fetchall():
            _notify(cur, tid, uid, "ESCALATION",
                    f"에스컬레이션 — 이벤트 #{event_id}: {body.reason[:60] or '지연 상위 보고'}", "/erp")
            n += 1
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'erp_process_event',%s,'ESCALATE',%s,%s)""",
            (tid, event_id, request.state.user_id, json.dumps({"reason": body.reason})))
    return {"eventId": event_id, "notified": n}


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
                # autocommit — 실패 행만 개별 거부하고 계속 (EXCLUDE 등)
                try:
                    cur.execute(
                        """INSERT INTO cst_price (tenant_id, product_code_id, supplier_id,
                           price, price_source, valid_from, valid_to)
                           VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                        (tid, pc[0], supplier_id, price, src,
                         cell("적용시작"), cell("적용종료") or None))
                    inserted += 1
                except Exception as e:  # noqa: BLE001
                    if "exclusion" in str(e).lower() or "overlap" in str(e).lower():
                        raise ValueError("기간 중복 (EXCLUDE)") from e
                    raise ValueError(str(e)[:80]) from e
            except ValueError as e:
                rejected.append(f"{r_i}행 {code}: {e}")
    return {"inserted": inserted, "rejected": rejected}


# ── B5 — 통합 검색 (⌘K · M-15-x) ──

@router.get("/search")
def global_search(q: str) -> dict[str, list[dict[str, Any]]]:
    """코드·문서·파일 통합 검색 — 화면 검색은 프론트 레지스트리에서 병합."""
    term = q.strip()
    if len(term) < 2:
        return {"codes": [], "docs": [], "files": []}
    like = f"%{term}%"
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT main_code, code_name FROM product_code
               WHERE tenant_id=%s AND (main_code ILIKE %s OR code_name ILIKE %s)
               ORDER BY main_code LIMIT 8""", (tid, like, like))
        codes = [{"code": r[0], "name": r[1]} for r in cur.fetchall()]
        cur.execute(
            """SELECT DISTINCT doc_no, title, management_grade FROM doc_control
               WHERE tenant_id=%s AND (doc_no ILIKE %s OR title ILIKE %s)
               ORDER BY doc_no LIMIT 8""", (tid, like, like))
        docs = [{"docNo": r[0], "title": r[1], "grade": r[2]} for r in cur.fetchall()]
        cur.execute(
            """SELECT file_id, file_name, file_type FROM dwg_file
               WHERE tenant_id=%s AND file_name ILIKE %s
               ORDER BY file_id DESC LIMIT 8""", (tid, like))
        files = [{"fileId": r[0], "name": r[1], "type": r[2]} for r in cur.fetchall()]
    return {"codes": codes, "docs": docs, "files": files}


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
        # uq_approval_pending — 동일 대상의 PENDING 이 이미 있으면 정직한 409
        cur.execute(
            """SELECT approval_id FROM sys_approval_request
               WHERE tenant_id=%s AND target_table=%s AND target_id=%s AND result IS NULL""",
            (tid, tt, body.targetId))
        dup = cur.fetchone()
        if dup:
            raise HTTPException(409, detail=f"이미 승인 대기 중 — {tt} (승인함 #{dup[0]} 처리 후 재요청)")
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
            # 원가 상세 영속 (B18) — cst_calc 3분류 (재료비/제조비/직접경비)
            _write_cst_calc(cur, tid, run_id, r)
            log("cst_calc — MATERIAL·MANUFACTURING·DIRECT 상세 적재")

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


def _write_cst_calc(cur, tid: int, run_id: int, r) -> None:
    """B18 — Run 원가 상세 3분류를 cst_calc 에 영속 (detail=JSONB 라인 내역).

    MATERIAL = BOM 단가 resolve 결과 · MANUFACTURING = 조립 공수(dwg_bom 노트×표준 임율)
    · DIRECT = 운송/검사 직접경비 (재료비 비율)."""
    material_lines = [
        {"code": i["resolvedCode"], "name": i.get("name", ""), "qty": i["quantity"],
         "priceK": i["priceK"], "amount": round((i["priceK"] or 0) * 1000 * i["quantity"])}
        for i in r.items
    ]
    material_total = round(r.total_k * 1000)
    # 제조비 — dwg_bom 조립 스텝 × 표준 2h × 임율 55,000/h (CST-003 입력 전 표준치)
    cur.execute(
        """SELECT COALESCE(b.assembly_note, p.part_name)
           FROM dwg_bom b JOIN prt_part p ON p.part_id=b.part_id
           JOIN dwg_drawing d ON d.drawing_id=b.drawing_id
           WHERE d.tenant_id=%s AND d.drawing_no='KDCR 3-13'
           ORDER BY COALESCE(b.assembly_seq, 999)""", (tid,))
    steps = [row[0] for row in cur.fetchall()] or ["조립 (표준)"]
    rate = 55_000
    mfg_lines = [{"step": s, "hours": 2, "rate": rate, "amount": 2 * rate} for s in steps]
    mfg_total = sum(ln["amount"] for ln in mfg_lines)
    direct_lines = [
        {"item": "운송·포장", "basis": "재료비 3%", "amount": round(material_total * 0.03)},
        {"item": "검사·시운전", "basis": "재료비 2%", "amount": round(material_total * 0.02)},
    ]
    direct_total = sum(ln["amount"] for ln in direct_lines)
    cur.execute("DELETE FROM cst_calc WHERE tenant_id=%s AND run_id=%s", (tid, run_id))
    for ctype, lines, total in (
        ("MATERIAL", material_lines, material_total),
        ("MANUFACTURING", mfg_lines, mfg_total),
        ("DIRECT", direct_lines, direct_total),
    ):
        cur.execute(
            """INSERT INTO cst_calc (tenant_id, run_id, calc_type, detail, total_amount)
               VALUES (%s,%s,%s,%s,%s)""",
            (tid, run_id, ctype, json.dumps({"lines": lines}), total))


@router.get("/cpq/runs/{run_id}/costs")
def run_costs(run_id: int) -> list[dict[str, Any]]:
    """Run 원가 상세 — cst_calc 3분류 (B18)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT calc_type, detail, total_amount FROM cst_calc
               WHERE tenant_id=%s AND run_id=%s ORDER BY calc_id""", (tid, run_id))
        rows = cur.fetchall()
    if not rows:
        raise HTTPException(404, detail=f"원가 상세 없음 — Run #{run_id} (v10.2 이후 실행분부터 적재)")
    return [{"calcType": r[0], "lines": r[1].get("lines", []), "total": float(r[2])} for r in rows]


# ── B19 창고·저장위치 계층 — erp_warehouse (ERP-020/021) ──

WAREHOUSE_TYPES = ("REGION", "PLANT", "WAREHOUSE", "STORAGE", "SECTOR")


@router.get("/erp/warehouses")
def warehouse_tree() -> list[dict[str, Any]]:
    """창고/저장위치 계층 — 재귀 CTE 로 경로 정렬 (depth 포함)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """WITH RECURSIVE t AS (
                 SELECT warehouse_id, parent_id, location_type, location_code, location_name,
                        hazard_allowed, inspection_cycle, remarks, 0 AS depth,
                        location_code::text AS path
                 FROM erp_warehouse WHERE tenant_id=%s AND parent_id IS NULL
                 UNION ALL
                 SELECT w.warehouse_id, w.parent_id, w.location_type, w.location_code,
                        w.location_name, w.hazard_allowed, w.inspection_cycle, w.remarks,
                        t.depth+1, t.path || '/' || w.location_code
                 FROM erp_warehouse w JOIN t ON w.parent_id=t.warehouse_id)
               SELECT warehouse_id, parent_id, location_type, location_code, location_name,
                      COALESCE(hazard_allowed,''), COALESCE(inspection_cycle,''),
                      COALESCE(remarks,''), depth, path
               FROM t ORDER BY path""", (tid,))
        return [
            {"warehouseId": r[0], "parentId": r[1], "type": r[2], "code": r[3], "name": r[4],
             "hazard": r[5], "inspection": r[6], "remarks": r[7], "depth": r[8], "path": r[9]}
            for r in cur.fetchall()
        ]


class WarehouseCreate(BaseModel):
    parentCode: str = ""         # 빈 값 = 최상위 (REGION)
    locationType: str
    code: str
    name: str
    hazard: str = ""
    inspection: str = ""
    remarks: str = ""


@router.post("/erp/warehouses", status_code=201, dependencies=[SETUP])
def warehouse_create(request: Request, body: WarehouseCreate) -> dict[str, Any]:
    lt = body.locationType.strip().upper()
    if lt not in WAREHOUSE_TYPES:
        raise HTTPException(422, detail=f"위치 유형 오류: {body.locationType} ({'|'.join(WAREHOUSE_TYPES)})")
    code, name = body.code.strip(), body.name.strip()
    if not code or not name:
        raise HTTPException(422, detail="위치 코드·이름은 필수입니다")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute("SELECT 1 FROM erp_warehouse WHERE tenant_id=%s AND location_code=%s", (tid, code))
        if cur.fetchone():
            raise HTTPException(409, detail=f"위치 코드 중복: {code}")
        parent_id = None
        if body.parentCode.strip():
            cur.execute(
                """SELECT warehouse_id, location_type FROM erp_warehouse
                   WHERE tenant_id=%s AND location_code=%s""", (tid, body.parentCode.strip()))
            pr = cur.fetchone()
            if not pr:
                raise HTTPException(422, detail=f"상위 위치 없음: {body.parentCode}")
            # 계층 순서 강제 — 자식 유형은 부모 유형보다 하위여야 함
            if WAREHOUSE_TYPES.index(lt) <= WAREHOUSE_TYPES.index(pr[1]):
                raise HTTPException(422, detail=f"계층 오류: {pr[1]} 아래에 {lt} 불가 (REGION→PLANT→WAREHOUSE→STORAGE→SECTOR)")
            parent_id = pr[0]
        elif lt != "REGION":
            raise HTTPException(422, detail="최상위는 REGION 만 가능")
        cur.execute(
            """INSERT INTO erp_warehouse (tenant_id, parent_id, location_type, location_code,
               location_name, hazard_allowed, inspection_cycle, remarks, created_by)
               VALUES (%s,%s,%s,%s,%s,NULLIF(%s,''),NULLIF(%s,''),NULLIF(%s,''),%s)
               RETURNING warehouse_id""",
            (tid, parent_id, lt, code[:30], name[:100], body.hazard.strip()[:100],
             body.inspection.strip()[:30], body.remarks.strip()[:300], request.state.login))
        wid = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'erp_warehouse',%s,'CREATE',%s,%s)""",
            (tid, wid, request.state.user_id, json.dumps({"code": code, "type": lt})))
    return {"warehouseId": wid, "code": code}


@router.delete("/erp/warehouses/{code}", dependencies=[SETUP])
def warehouse_delete(code: str, request: Request) -> dict[str, Any]:
    """위치 삭제 — 하위 위치 존재 시 409 보호."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute("SELECT warehouse_id FROM erp_warehouse WHERE tenant_id=%s AND location_code=%s",
                    (tid, code))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"위치 없음: {code}")
        cur.execute("SELECT 1 FROM erp_warehouse WHERE parent_id=%s LIMIT 1", (row[0],))
        if cur.fetchone():
            raise HTTPException(409, detail=f"하위 위치가 있는 노드는 삭제 불가: {code}")
        cur.execute("DELETE FROM erp_warehouse WHERE warehouse_id=%s", (row[0],))
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'erp_warehouse',%s,'DELETE',%s,%s)""",
            (tid, row[0], request.state.user_id, json.dumps({"code": code})))
    return {"deleted": code}


# ── B19 QCR 발행·PO 문서 등록 — 구매 상세 (ERP-017) ──

class QcrIssue(BaseModel):
    codes: list[str]
    note: str = ""


@router.post("/erp/qcr", status_code=201, dependencies=[SETUP])
def qcr_issue(request: Request, body: QcrIssue) -> dict[str, Any]:
    """견적 요청(QCR) 발행 — 감사 기록 + 구매 담당(SETUP+) 알림 (공급자 회신 대기)."""
    codes = [c.strip() for c in body.codes if c.strip()]
    if not codes:
        raise HTTPException(422, detail="발행 대상 품목이 없습니다")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute("SELECT count(*)+1 FROM sys_history WHERE tenant_id=%s AND action='QCR_ISSUE'",
                    (tid,))
        qcr_no = f"QCR-{cur.fetchone()[0]:04d}"
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'erp_qcr',0,'QCR_ISSUE',%s,%s) RETURNING history_id""",
            (tid, request.state.user_id,
             json.dumps({"qcrNo": qcr_no, "codes": codes, "note": body.note.strip()[:300]})))
        cur.execute(
            """SELECT user_id FROM sys_user
               WHERE tenant_id=%s AND user_level IN ('SETUP','ADMIN') AND user_id<>%s""",
            (tid, request.state.user_id))
        for (uid,) in cur.fetchall():
            _notify(cur, tid, uid, "QCR_ISSUE",
                    f"견적 요청 발행 — {qcr_no} ({len(codes)}품목, 공급자 회신 대기)", "/erp")
    return {"qcrNo": qcr_no, "codes": len(codes)}


class PoCreate(BaseModel):
    codes: list[str]
    totalK: float = 0
    deliveryTerms: str = "EXW 창원공장"      # ERP-017 납품조건
    transport: str = "육로 (트럭)"           # 운송수단
    minOrderQty: int = 1                     # 최소구매수량
    certRequired: bool = False               # 인증서 요구


@router.post("/erp/po", status_code=201, dependencies=[SETUP])
def po_create(request: Request, body: PoCreate) -> dict[str, Any]:
    """발주 생성 — PO 를 doc_control 문서로 영속 (구매 조건 remarks·공급자 코드 라인 포함)."""
    codes = [c.strip() for c in body.codes if c.strip()]
    if not codes:
        raise HTTPException(422, detail="발주 품목이 없습니다")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT count(*)+1 FROM doc_control WHERE tenant_id=%s AND doc_type='PO'", (tid,))
        seq = cur.fetchone()[0]
        po_no = f"PO-61313-{seq}"
        # 공급자 코드 매핑 병기 (ERP-018 — 발주 문서에 공급자 코드 표시)
        sup_lines: list[str] = []
        for c in codes:
            cur.execute(
                """SELECT m.supplier_code, co.company_name
                   FROM prt_supplier_code_map m
                   JOIN com_company co ON co.company_id=m.supplier_id
                   LEFT JOIN prt_part p ON p.part_id=m.part_id
                   LEFT JOIN product_code pc
                     ON pc.product_code_id=COALESCE(m.product_code_id, p.product_code_id)
                   WHERE m.tenant_id=%s AND pc.main_code=%s LIMIT 1""", (tid, c))
            m = cur.fetchone()
            sup_lines.append(f"{c}↔{m[0]}({m[1]})" if m else c)
        terms = (f"납품:{body.deliveryTerms.strip()[:40]} · 운송:{body.transport.strip()[:30]}"
                 f" · 최소수량:{body.minOrderQty} · 인증서:{'요구' if body.certRequired else '불요'}"
                 f" · 품목:{', '.join(sup_lines)}")
        cur.execute(
            """INSERT INTO doc_control (tenant_id, doc_no, title, doc_type, released_status,
               version, person, management_grade, remarks, created_by)
               VALUES (%s,%s,%s,'PO','SET_UP','v1.0',%s,'S-3',%s,%s) RETURNING doc_control_id""",
            (tid, po_no, f"발주서 {po_no} — {len(codes)}품목 {body.totalK:,.0f}K",
             request.state.login, terms[:500], request.state.login))
        doc_id = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'doc_control',%s,'PO_CREATE',%s,%s)""",
            (tid, doc_id, request.state.user_id,
             json.dumps({"poNo": po_no, "codes": codes, "terms": terms[:300]})))
    return {"poNo": po_no, "docNo": po_no, "terms": terms}


# ── B18 수익성(PCR)·견적 lifecycle — cst_pcr·cst_quotation ──

PCR_BUSINESS_TYPES = ("PRE_SALES", "MAIN")


def _latest_cost_base(cur, tid: int) -> tuple[int, dict[str, float]]:
    """최근 SUCCESS Run 의 cst_calc 합계 → (run_id, {MATERIAL, MANUFACTURING, DIRECT})."""
    cur.execute(
        """SELECT c.run_id, c.calc_type, c.total_amount
           FROM cst_calc c JOIN cpq_run r ON r.run_id=c.run_id AND r.status='SUCCESS'
           WHERE c.tenant_id=%s AND c.run_id=(
             SELECT max(c2.run_id) FROM cst_calc c2
             JOIN cpq_run r2 ON r2.run_id=c2.run_id AND r2.status='SUCCESS'
             WHERE c2.tenant_id=%s)""", (tid, tid))
    rows = cur.fetchall()
    if not rows:
        raise HTTPException(409, detail="원가 상세가 있는 SUCCESS Run 이 없습니다 — EDIM Run 먼저 실행")
    totals = {r[1]: float(r[2]) for r in rows}
    return rows[0][0], totals


class PcrCreate(BaseModel):
    businessType: str = "PRE_SALES"
    marginRate: float = 0.35     # 목표 마진율 — 매출 = 직접비 × (1+rate)


@router.post("/cost/pcr", dependencies=[SETUP])
def pcr_upsert(request: Request, body: PcrCreate) -> dict[str, Any]:
    """PCR 수익성 보고서 — 최근 Run 원가 기반 산출 (UNIQUE selection×business_type upsert)."""
    bt = body.businessType.strip().upper()
    if bt not in PCR_BUSINESS_TYPES:
        raise HTTPException(422, detail=f"사업유형 오류: {body.businessType} (PRE_SALES|MAIN)")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute("SELECT min(selection_id) FROM cpq_selection WHERE tenant_id=%s", (tid,))
        sel = cur.fetchone()
        if not sel or not sel[0]:
            raise HTTPException(409, detail="cpq_selection 없음")
        run_id, totals = _latest_cost_base(cur, tid)
        direct_total = sum(totals.values())
        revenue = round(direct_total * (1 + body.marginRate))
        sga = round(revenue * 0.08)
        margin = revenue - direct_total
        ebit = margin - sga
        sections = {
            "runId": run_id, "revenue": revenue,
            "material": totals.get("MATERIAL", 0),
            "manufacturing": totals.get("MANUFACTURING", 0),
            "direct": totals.get("DIRECT", 0),
            "sga": sga, "marginRate": body.marginRate,
        }
        cur.execute(
            """UPDATE cst_pcr SET sections=%s, direct_cost_total=%s, contribution_margin=%s,
               ebit=%s, status='DRAFT', updated_by=%s, updated_at=now()
               WHERE tenant_id=%s AND selection_id=%s AND business_type=%s RETURNING pcr_id""",
            (json.dumps(sections), direct_total, margin, ebit, request.state.login,
             tid, sel[0], bt))
        row = cur.fetchone()
        if not row:
            cur.execute(
                """INSERT INTO cst_pcr (tenant_id, selection_id, business_type, sections,
                   direct_cost_total, contribution_margin, ebit, created_by)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING pcr_id""",
                (tid, sel[0], bt, json.dumps(sections), direct_total, margin, ebit,
                 request.state.login))
            row = cur.fetchone()
    return {"pcrId": row[0], "businessType": bt, "revenue": revenue,
            "directCostTotal": direct_total, "contributionMargin": margin, "ebit": ebit}


@router.get("/cost/pcr")
def pcr_list() -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT p.pcr_id, p.business_type, p.sections, p.direct_cost_total,
                      p.contribution_margin, p.ebit, p.status, s.finished_goods_code
               FROM cst_pcr p JOIN cpq_selection s ON s.selection_id=p.selection_id
               WHERE p.tenant_id=%s ORDER BY p.pcr_id""", (tid,))
        return [
            {"pcrId": r[0], "businessType": r[1], "sections": r[2],
             "directCostTotal": float(r[3]),
             "contributionMargin": float(r[4]) if r[4] is not None else None,
             "ebit": float(r[5]) if r[5] is not None else None,
             "status": r[6], "code": r[7]}
            for r in cur.fetchall()
        ]


class QuotationCreate(BaseModel):
    businessType: str = "PRE_SALES"
    validityPeriod: str = "견적일로부터 30일"
    deliveryTerms: str = "FOB 부산"
    paymentTerms: str = "T/T 30일"


@router.post("/cost/quotations", status_code=201, dependencies=[SETUP])
def quotation_create(request: Request, body: QuotationCreate) -> dict[str, Any]:
    """견적 확정 — PCR 기반 cst_quotation 행 생성 (line_items = 최근 Run 원가 라인)."""
    bt = body.businessType.strip().upper()
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT p.pcr_id, p.sections, p.selection_id, s.project_id
               FROM cst_pcr p JOIN cpq_selection s ON s.selection_id=p.selection_id
               WHERE p.tenant_id=%s AND p.business_type=%s
               ORDER BY p.pcr_id DESC LIMIT 1""", (tid, bt))
        pcr = cur.fetchone()
        if not pcr:
            raise HTTPException(409, detail=f"PCR 없음 ({bt}) — 수익성 보고서 먼저 생성")
        cur.execute(
            "SELECT company_id FROM com_company WHERE tenant_id=%s ORDER BY company_id LIMIT 1", (tid,))
        customer = cur.fetchone()[0]
        run_id = pcr[1].get("runId")
        cur.execute(
            """SELECT detail FROM cst_calc WHERE tenant_id=%s AND run_id=%s AND calc_type='MATERIAL'""",
            (tid, run_id))
        mat = cur.fetchone()
        line_items = (mat[0].get("lines", []) if mat else [])
        total = pcr[1].get("revenue", 0)
        cur.execute("SELECT count(*)+1 FROM cst_quotation WHERE tenant_id=%s", (tid,))
        seq = cur.fetchone()[0]
        qno = f"QT-{run_id}-{seq:03d}"
        cur.execute(
            """INSERT INTO cst_quotation (tenant_id, quotation_no, pcr_id, project_id, customer_id,
               total_amount, currency, vat_mode, validity_period, delivery_terms, payment_terms,
               line_items, created_by)
               VALUES (%s,%s,%s,%s,%s,%s,'KRW','별도',%s,%s,%s,%s,%s) RETURNING quotation_id""",
            (tid, qno, pcr[0], pcr[3], customer, total, body.validityPeriod.strip()[:50],
             body.deliveryTerms.strip()[:200], body.paymentTerms.strip()[:200],
             json.dumps(line_items), request.state.login))
        qid = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'cst_quotation',%s,'CREATE',%s,%s)""",
            (tid, qid, request.state.user_id, json.dumps({"quotationNo": qno, "total": total})))
    return {"quotationId": qid, "quotationNo": qno, "total": total}


@router.get("/cost/quotations")
def quotation_list() -> list[dict[str, Any]]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT q.quotation_id, q.quotation_no, q.total_amount, q.currency, q.status,
                      to_char(q.created_at,'YYYY-MM-DD'), p.project_no, c.company_name,
                      q.validity_period, q.delivery_terms, q.payment_terms
               FROM cst_quotation q
               JOIN prj_project p ON p.project_id=q.project_id
               JOIN com_company c ON c.company_id=q.customer_id
               WHERE q.tenant_id=%s ORDER BY q.quotation_id DESC""", (tid,))
        return [
            {"quotationId": r[0], "quotationNo": r[1], "total": float(r[2]), "currency": r[3],
             "status": r[4], "date": r[5], "project": r[6], "customer": r[7],
             "validity": r[8], "delivery": r[9], "payment": r[10]}
            for r in cur.fetchall()
        ]


@router.delete("/cost/quotations/{quotation_id}", dependencies=[SETUP])
def quotation_delete(quotation_id: int, request: Request) -> dict[str, Any]:
    """견적 삭제 — DRAFT 한정 (발행/승인 견적 보호)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT status, quotation_no FROM cst_quotation WHERE tenant_id=%s AND quotation_id=%s",
            (tid, quotation_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"견적 없음: #{quotation_id}")
        if row[0] != "DRAFT":
            raise HTTPException(409, detail=f"DRAFT 견적만 삭제 가능 (현재 {row[0]})")
        cur.execute("DELETE FROM cst_quotation WHERE quotation_id=%s", (quotation_id,))
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'cst_quotation',%s,'DELETE',%s,%s)""",
            (tid, quotation_id, request.state.user_id, json.dumps({"quotationNo": row[1]})))
    return {"deleted": quotation_id}


@router.get("/cost/quotations/{quotation_id}/render.pdf")
def quotation_render(quotation_id: int) -> Any:
    """견적서 PDF 렌더 — 영속 행(line_items) 기준 (quote-preview 와 동일 렌더러)."""
    from types import SimpleNamespace

    from fastapi.responses import Response
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT q.quotation_no, q.line_items, q.total_amount, p.project_no
               FROM cst_quotation q JOIN prj_project p ON p.project_id=q.project_id
               WHERE q.tenant_id=%s AND q.quotation_id=%s""", (tid, quotation_id))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, detail=f"견적 없음: #{quotation_id}")
    items = [{"resolvedCode": ln.get("code", "?"), "name": ln.get("name", ""),
              "quantity": ln.get("qty", 1), "priceK": ln.get("priceK")}
             for ln in row[1]]
    ns = SimpleNamespace(items=items, total_k=float(row[2]) / 1000, files=[])
    rp.step_quotation(ns, f"{row[3]} · {row[0]}")
    return Response(content=ns.files[-1][3], media_type="application/pdf",
                    headers={"Content-Disposition": f"inline; filename=\"{row[0]}.pdf\""})


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


# ── B7 — PLM 도면 대장 (dwg_drawing·dwg_revision·dwg_supersedure 개방) ──

def _rev_next(rev: str) -> str:
    """Rev 문자 증가 — A→B…Z→AA (엑셀 컬럼 방식)."""
    letters = list(rev.strip().upper() or "@")   # '@'+1 == 'A'
    i = len(letters) - 1
    while i >= 0:
        if letters[i] != "Z":
            letters[i] = chr(ord(letters[i]) + 1)
            return "".join(letters)
        letters[i] = "A"
        i -= 1
    return "A" + "".join(letters)


def _drawing_id(cur, tid: int, drawing_no: str) -> int:
    cur.execute(
        "SELECT drawing_id FROM dwg_drawing WHERE tenant_id=%s AND drawing_no=%s",
        (tid, drawing_no.strip()))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, detail=f"도면 없음: {drawing_no}")
    return row[0]


@router.get("/drawings")
def drawings_list(code: str = "") -> list[dict[str, Any]]:
    """도면 대장 — dwg_drawing + Rev 수·최신 DXF 연결. code 지정 시 해당 도면번호만."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        where, params = "d.tenant_id=%s", [tid]
        if code.strip():
            where += " AND d.drawing_no=%s"
            params.append(code.strip())
        cur.execute(
            f"""SELECT d.drawing_no, d.drawing_name, d.drawing_type, d.dwg_kind,
                       d.current_rev, d.status,
                       (SELECT COUNT(*) FROM dwg_revision r WHERE r.drawing_id=d.drawing_id),
                       f.file_id, f.file_name,
                       EXISTS (SELECT 1 FROM dwg_supersedure s WHERE s.old_drawing_id=d.drawing_id)
                FROM dwg_drawing d
                LEFT JOIN LATERAL (
                    SELECT file_id, file_name FROM dwg_file
                    WHERE drawing_id=d.drawing_id AND file_type='DXF'
                    ORDER BY file_id DESC LIMIT 1) f ON TRUE
                WHERE {where} ORDER BY d.drawing_no""", params)
        return [
            {"drawingNo": r[0], "name": r[1], "type": r[2], "kind": r[3],
             "rev": r[4], "status": r[5], "revCount": r[6],
             "fileId": r[7], "fileName": r[8], "superseded": bool(r[9])}
            for r in cur.fetchall()
        ]


class DrawingCreate(BaseModel):
    drawingNo: str
    name: str
    drawingType: str = "PART"
    kind: str = "STANDARD"


@router.post("/drawings", status_code=201, dependencies=[SETUP])
def create_drawing(request: Request, body: DrawingCreate) -> dict[str, Any]:
    """도면 등록 — dwg_drawing insert + Rev.A 이력 (중복 409)."""
    no, name = body.drawingNo.strip(), body.name.strip()
    if not no or not name:
        raise HTTPException(422, detail="도면번호·도면명은 필수입니다")
    if body.drawingType not in ("ASSEMBLY", "PART", "LAYOUT"):
        raise HTTPException(422, detail=f"유형 오류: {body.drawingType} (ASSEMBLY|PART|LAYOUT)")
    if body.kind not in ("APPROVAL", "MANUFACTURING", "STANDARD"):
        raise HTTPException(422, detail=f"Kind 오류: {body.kind}")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT 1 FROM dwg_drawing WHERE tenant_id=%s AND drawing_no=%s", (tid, no))
        if cur.fetchone():
            raise HTTPException(409, detail=f"도면번호 중복: {no}")
        cur.execute(
            """INSERT INTO dwg_drawing (tenant_id, drawing_no, drawing_name, drawing_type,
               dwg_kind, current_rev, status, created_by)
               VALUES (%s,%s,%s,%s,%s,'A','DRAFT',%s) RETURNING drawing_id""",
            (tid, no, name[:200], body.drawingType, body.kind, request.state.login))
        drawing_id = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO dwg_revision (drawing_id, rev_no, rev_date, rev_reason, revised_by)
               VALUES (%s,'A',CURRENT_DATE,'최초 발행',%s)""",
            (drawing_id, request.state.login))
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'dwg_drawing',%s,'CREATE',%s,%s)""",
            (tid, drawing_id, request.state.user_id,
             json.dumps({"drawingNo": no, "name": name})))
    return {"drawingId": drawing_id, "rev": "A", "status": "DRAFT"}


@router.delete("/drawings/{drawing_no}", dependencies=[SETUP])
def delete_drawing(drawing_no: str, request: Request) -> dict[str, Any]:
    """도면 삭제 — RELEASED 보호 (발행 도면 불가). Rev·Supersedure·승인·블록·관계 연쇄 정리,
    연결 파일은 보존(도면 링크만 해제)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT drawing_id, status FROM dwg_drawing WHERE tenant_id=%s AND drawing_no=%s",
            (tid, drawing_no))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"도면 없음: {drawing_no}")
        did, status = row
        if status == "RELEASED":
            raise HTTPException(409, detail=f"RELEASED 도면은 삭제 불가 (현재 {status})")
        cur.execute(
            "DELETE FROM dwg_supersedure WHERE old_drawing_id=%s OR new_drawing_id=%s",
            (did, did))
        cur.execute("DELETE FROM dwg_approval WHERE drawing_id=%s", (did,))
        cur.execute("DELETE FROM dwg_document WHERE drawing_id=%s", (did,))
        cur.execute("DELETE FROM dwg_part_relation WHERE drawing_id=%s", (did,))
        cur.execute("UPDATE dwg_file SET drawing_id=NULL WHERE drawing_id=%s", (did,))
        cur.execute("DELETE FROM dwg_revision WHERE drawing_id=%s", (did,))
        cur.execute("DELETE FROM dwg_drawing WHERE drawing_id=%s", (did,))
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'dwg_drawing',%s,'DELETE',%s,%s)""",
            (tid, did, request.state.user_id, json.dumps({"drawingNo": drawing_no})))
    return {"deleted": drawing_no}


@router.get("/drawings/{drawing_no}/revisions")
def drawing_revisions(drawing_no: str) -> list[dict[str, Any]]:
    """Rev 이력 — dwg_revision (최신 우선)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        did = _drawing_id(cur, tid, drawing_no)
        cur.execute(
            """SELECT rev_no, to_char(rev_date,'YYYY-MM-DD'), COALESCE(rev_reason,''), revised_by
               FROM dwg_revision WHERE drawing_id=%s ORDER BY revision_id DESC""", (did,))
        return [{"rev": r[0], "date": r[1], "reason": r[2], "by": r[3]} for r in cur.fetchall()]


class RevUpRequest(BaseModel):
    reason: str = ""


@router.post("/drawings/{drawing_no}/revisions", status_code=201, dependencies=[SETUP])
def rev_up(drawing_no: str, request: Request, body: RevUpRequest) -> dict[str, Any]:
    """Rev 올리기 — current_rev 증가 + dwg_revision 행 + 이력 (B→C)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT drawing_id, current_rev FROM dwg_drawing
               WHERE tenant_id=%s AND drawing_no=%s""", (tid, drawing_no.strip()))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"도면 없음: {drawing_no}")
        did, cur_rev = row
        new_rev = _rev_next(cur_rev)
        cur.execute(
            """INSERT INTO dwg_revision (drawing_id, rev_no, rev_date, rev_reason, revised_by)
               VALUES (%s,%s,CURRENT_DATE,%s,%s)""",
            (did, new_rev, body.reason.strip()[:500] or f"Rev {cur_rev}→{new_rev}",
             request.state.login))
        cur.execute(
            """UPDATE dwg_drawing SET current_rev=%s, updated_by=%s, updated_at=now()
               WHERE drawing_id=%s""", (new_rev, request.state.login, did))
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'dwg_drawing',%s,'REV_UP',%s,%s)""",
            (tid, did, request.state.user_id,
             json.dumps({"from": cur_rev, "to": new_rev, "reason": body.reason})))
    return {"drawingNo": drawing_no, "rev": new_rev, "prevRev": cur_rev}


@router.get("/drawings/supersedures")
def supersedures_list() -> list[dict[str, Any]]:
    """Supersedure — Rev 대체 이력 (구도면 → 신도면)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT o.drawing_no, o.drawing_name, n.drawing_no, n.current_rev,
                      COALESCE(s.reason,''), to_char(s.superseded_date,'YYYY-MM-DD')
               FROM dwg_supersedure s
               JOIN dwg_drawing o ON o.drawing_id=s.old_drawing_id
               JOIN dwg_drawing n ON n.drawing_id=s.new_drawing_id
               WHERE s.tenant_id=%s ORDER BY s.supersedure_id DESC""", (tid,))
        return [
            {"oldNo": r[0], "oldName": r[1], "newNo": r[2], "newRev": r[3],
             "reason": r[4], "date": r[5]}
            for r in cur.fetchall()
        ]


class SupersedeRequest(BaseModel):
    oldNo: str
    newNo: str
    reason: str = ""


@router.post("/drawings/supersedures", status_code=201, dependencies=[SETUP])
def create_supersedure(request: Request, body: SupersedeRequest) -> dict[str, Any]:
    """대체 등록 — old 도면을 new 도면으로 대체 (old 는 1회만, 409)."""
    if body.oldNo.strip() == body.newNo.strip():
        raise HTTPException(422, detail="구도면과 신도면이 같습니다")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        old_id = _drawing_id(cur, tid, body.oldNo)
        new_id = _drawing_id(cur, tid, body.newNo)
        cur.execute("SELECT 1 FROM dwg_supersedure WHERE old_drawing_id=%s", (old_id,))
        if cur.fetchone():
            raise HTTPException(409, detail=f"이미 대체된 도면: {body.oldNo}")
        cur.execute(
            """INSERT INTO dwg_supersedure (tenant_id, old_drawing_id, new_drawing_id,
               reason, superseded_date, created_by)
               VALUES (%s,%s,%s,%s,CURRENT_DATE,%s) RETURNING supersedure_id""",
            (tid, old_id, new_id, body.reason.strip()[:500] or None, request.state.login))
        sid = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'dwg_supersedure',%s,'CREATE',%s,%s)""",
            (tid, sid, request.state.user_id,
             json.dumps({"old": body.oldNo, "new": body.newNo, "reason": body.reason})))
    return {"supersedureId": sid}


# ── B16 도면 상세 — Variants·첨부·단계별 승인·블록·부품 관계 (dwg_* 도메인 완결) ──

@router.get("/drawings/{drawing_no}/variants")
def drawing_variants(drawing_no: str) -> list[dict[str, Any]]:
    """Variants — 동일 패밀리 도면 (도면번호 마지막 '-' 토큰 앞 접두 일치, 자신 제외)."""
    no = drawing_no.strip()
    prefix = no.rsplit("-", 1)[0] + "-" if "-" in no else no
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT d.drawing_no, d.drawing_name, d.current_rev, d.status,
                      EXISTS(SELECT 1 FROM dwg_supersedure s WHERE s.old_drawing_id=d.drawing_id)
               FROM dwg_drawing d
               WHERE d.tenant_id=%s AND d.drawing_no LIKE %s AND d.drawing_no<>%s
               ORDER BY d.drawing_no""", (tid, prefix + "%", no))
        return [{"drawingNo": r[0], "name": r[1], "rev": r[2], "status": r[3],
                 "superseded": r[4]} for r in cur.fetchall()]


@router.get("/drawings/{drawing_no}/files")
def drawing_files(drawing_no: str) -> list[dict[str, Any]]:
    """첨부 — 이 도면에 연결된 dwg_file (Run DXF·업로드본)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        did = _drawing_id(cur, tid, drawing_no)
        cur.execute(
            """SELECT file_id, file_name, file_type, COALESCE(file_size,0),
                      to_char(uploaded_date,'YYYY-MM-DD HH24:MI')
               FROM dwg_file WHERE tenant_id=%s AND drawing_id=%s
               ORDER BY file_id DESC""", (tid, did))
        return [{"fileId": r[0], "fileName": r[1], "fileType": r[2], "size": r[3],
                 "date": r[4]} for r in cur.fetchall()]


DWG_APPROVAL_STEPS = ("WRITE", "REVIEW", "APPROVE")


@router.get("/drawings/{drawing_no}/approvals")
def drawing_approvals(drawing_no: str) -> list[dict[str, Any]]:
    """단계별 승인 이력 — dwg_approval (WRITE→REVIEW→APPROVE)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        did = _drawing_id(cur, tid, drawing_no)
        cur.execute(
            """SELECT a.approval_id, a.step, a.result, COALESCE(a.comment,''),
                      to_char(a.approval_date,'YYYY-MM-DD'), u.user_name
               FROM dwg_approval a JOIN sys_user u ON u.user_id=a.approver_id
               WHERE a.drawing_id=%s ORDER BY a.approval_id""", (did,))
        return [{"approvalId": r[0], "step": r[1], "result": r[2], "comment": r[3],
                 "date": r[4], "by": r[5]} for r in cur.fetchall()]


class DwgApprovalCreate(BaseModel):
    step: str                 # WRITE | REVIEW | APPROVE
    approve: bool = True
    comment: str = ""


@router.post("/drawings/{drawing_no}/approvals", status_code=201, dependencies=[SETUP])
def drawing_approval_decide(drawing_no: str, request: Request, body: DwgApprovalCreate) -> dict[str, Any]:
    """단계 결정 — 순서 강제 (이전 단계 APPROVED 필요), 반려 시 도면 DRAFT 복귀.

    상태 전이: WRITE 승인→REVIEW · APPROVE 승인→APPROVED · 반려→DRAFT (이후 단계 재진행)."""
    step = body.step.strip().upper()
    if step not in DWG_APPROVAL_STEPS:
        raise HTTPException(422, detail=f"step 오류: {body.step} (WRITE|REVIEW|APPROVE)")
    if not body.approve and not body.comment.strip():
        raise HTTPException(422, detail="반려는 코멘트 필수")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        did = _drawing_id(cur, tid, drawing_no)
        cur.execute(
            """SELECT step FROM dwg_approval
               WHERE drawing_id=%s AND result='APPROVED'""", (did,))
        approved = {r[0] for r in cur.fetchall()}
        idx = DWG_APPROVAL_STEPS.index(step)
        if step in approved:
            raise HTTPException(409, detail=f"이미 승인된 단계: {step}")
        if idx > 0 and DWG_APPROVAL_STEPS[idx - 1] not in approved:
            raise HTTPException(409, detail=f"이전 단계({DWG_APPROVAL_STEPS[idx - 1]}) 승인 후 진행 가능")
        result = "APPROVED" if body.approve else "REJECTED"
        cur.execute(
            """INSERT INTO dwg_approval (drawing_id, step, approver_id, approval_date, result, comment)
               VALUES (%s,%s,%s,CURRENT_DATE,%s,NULLIF(%s,'')) RETURNING approval_id""",
            (did, step, request.state.user_id, result, body.comment.strip()[:1000]))
        approval_id = cur.fetchone()[0]
        new_status = None
        if not body.approve:
            new_status = "DRAFT"
            cur.execute("DELETE FROM dwg_approval WHERE drawing_id=%s AND result='APPROVED'", (did,))
        elif step == "WRITE":
            new_status = "REVIEW"
        elif step == "APPROVE":
            new_status = "APPROVED"
        if new_status:
            cur.execute(
                """UPDATE dwg_drawing SET status=%s, updated_by=%s, updated_at=now()
                   WHERE drawing_id=%s AND status<>'RELEASED'""",
                (new_status, request.state.login, did))
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'dwg_approval',%s,'DECIDE',%s,%s)""",
            (tid, approval_id, request.state.user_id,
             json.dumps({"drawingNo": drawing_no, "step": step, "result": result})))
    return {"approvalId": approval_id, "step": step, "result": result,
            "drawingStatus": new_status}


@router.get("/drawings/{drawing_no}/blocks")
def drawing_blocks(drawing_no: str) -> list[dict[str, Any]]:
    """도면 블록 — dwg_document (Design Editor Block 패널 원천, content=좌표/치수 JSONB)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        did = _drawing_id(cur, tid, drawing_no)
        cur.execute(
            """SELECT document_id, COALESCE(block_name,''), content, origin_x, origin_y
               FROM dwg_document WHERE tenant_id=%s AND drawing_id=%s
               ORDER BY document_id""", (tid, did))
        return [
            {"documentId": r[0], "blockName": r[1], "content": r[2],
             "originX": float(r[3]) if r[3] is not None else None,
             "originY": float(r[4]) if r[4] is not None else None}
            for r in cur.fetchall()
        ]


@router.get("/drawings/{drawing_no}/relations")
def drawing_relations(drawing_no: str) -> list[dict[str, Any]]:
    """부품 관계 — dwg_part_relation (정렬·접촉 조건 + Macro 규칙, 부품 상세 실데이터)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        did = _drawing_id(cur, tid, drawing_no)
        cur.execute(
            """SELECT r.relation_id, r.block_a, r.block_b, COALESCE(r.condition_align,''),
                      COALESCE(r.condition_contact,''), m.macro_name, r.priority, r.approval_status
               FROM dwg_part_relation r
               LEFT JOIN tbx_macro m ON m.macro_id=r.value_macro_id
               WHERE r.tenant_id=%s AND r.drawing_id=%s ORDER BY r.priority, r.relation_id""",
            (tid, did))
        return [{"relationId": r[0], "blockA": r[1], "blockB": r[2], "align": r[3],
                 "contact": r[4], "macro": r[5], "priority": r[6], "status": r[7]}
                for r in cur.fetchall()]


# ── B17 부품 마스터 — prt_part·dwg_bom·prt_supplier_code_map·product_code_item ──

@router.get("/parts")
def parts_list() -> list[dict[str, Any]]:
    """부품 대장 — 재질·공급처·제품코드 조인 (M-4-7)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT p.part_id, p.part_no, p.part_name, COALESCE(p.specification,''),
                      m.material_code, c.company_name, pc.main_code, p.unit,
                      p.weight, p.is_standard,
                      (SELECT count(*) FROM dwg_bom b WHERE b.part_id=p.part_id)
               FROM prt_part p
               LEFT JOIN mat_material m ON m.material_id=p.material_id
               LEFT JOIN com_company c ON c.company_id=p.supplier_id
               LEFT JOIN product_code pc ON pc.product_code_id=p.product_code_id
               WHERE p.tenant_id=%s ORDER BY p.part_no""", (tid,))
        return [
            {"partId": r[0], "partNo": r[1], "name": r[2], "spec": r[3],
             "material": r[4], "supplier": r[5], "productCode": r[6], "unit": r[7],
             "weight": float(r[8]) if r[8] is not None else None,
             "isStandard": r[9], "bomCount": r[10]}
            for r in cur.fetchall()
        ]


class PartCreate(BaseModel):
    partNo: str
    name: str
    spec: str = ""
    materialCode: str = ""       # mat_material.material_code (없으면 미연결)
    supplier: str = ""           # com_company 이름 — 미존재 시 자동 생성 (단가 등록과 동일)
    productCode: str = ""        # product_code.main_code
    unit: str = "EA"
    weight: float | None = None
    isStandard: bool = False


@router.post("/parts", status_code=201, dependencies=[SETUP])
def part_create(request: Request, body: PartCreate) -> dict[str, Any]:
    no, name = body.partNo.strip(), body.name.strip()
    if not no or not name:
        raise HTTPException(422, detail="부품번호·부품명은 필수입니다")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute("SELECT 1 FROM prt_part WHERE tenant_id=%s AND part_no=%s", (tid, no))
        if cur.fetchone():
            raise HTTPException(409, detail=f"부품번호 중복: {no}")
        mid = None
        if body.materialCode.strip():
            cur.execute("SELECT material_id FROM mat_material WHERE tenant_id=%s AND material_code=%s",
                        (tid, body.materialCode.strip()))
            m = cur.fetchone()
            if not m:
                raise HTTPException(422, detail=f"재질 코드 없음: {body.materialCode} (M-3-2 등록 필요)")
            mid = m[0]
        sid = None
        if body.supplier.strip():
            cur.execute("SELECT company_id FROM com_company WHERE tenant_id=%s AND company_name=%s LIMIT 1",
                        (tid, body.supplier.strip()))
            s = cur.fetchone()
            if s:
                sid = s[0]
            else:
                cur.execute(
                    """INSERT INTO com_company (tenant_id, company_name, company_type)
                       VALUES (%s,%s,'SUPPLIER') RETURNING company_id""", (tid, body.supplier.strip()))
                sid = cur.fetchone()[0]
        pcid = None
        if body.productCode.strip():
            cur.execute("SELECT product_code_id FROM product_code WHERE tenant_id=%s AND main_code=%s LIMIT 1",
                        (tid, body.productCode.strip()))
            pc = cur.fetchone()
            if not pc:
                raise HTTPException(422, detail=f"제품코드 없음: {body.productCode}")
            pcid = pc[0]
        cur.execute(
            """INSERT INTO prt_part (tenant_id, part_no, part_name, specification, material_id,
               supplier_id, product_code_id, unit, weight, is_standard, created_by)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING part_id""",
            (tid, no, name[:200], body.spec.strip()[:300] or None, mid, sid, pcid,
             body.unit.strip()[:10] or "EA", body.weight, body.isStandard, request.state.login))
        part_id = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'prt_part',%s,'CREATE',%s,%s)""",
            (tid, part_id, request.state.user_id, json.dumps({"partNo": no, "name": name})))
    return {"partId": part_id, "partNo": no}


@router.delete("/parts/{part_no}", dependencies=[SETUP])
def part_delete(part_no: str, request: Request) -> dict[str, Any]:
    """부품 삭제 — BOM 참조 중이면 409 보호, 공급자 코드 매핑은 연쇄 정리."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute("SELECT part_id FROM prt_part WHERE tenant_id=%s AND part_no=%s", (tid, part_no))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, detail=f"부품 없음: {part_no}")
        pid = row[0]
        cur.execute("SELECT 1 FROM dwg_bom WHERE part_id=%s LIMIT 1", (pid,))
        if cur.fetchone():
            raise HTTPException(409, detail=f"BOM 이 참조하는 부품은 삭제 불가: {part_no}")
        cur.execute("DELETE FROM prt_supplier_code_map WHERE part_id=%s", (pid,))
        cur.execute("DELETE FROM prt_part WHERE part_id=%s", (pid,))
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'prt_part',%s,'DELETE',%s,%s)""",
            (tid, pid, request.state.user_id, json.dumps({"partNo": part_no})))
    return {"deleted": part_no}


@router.get("/drawings/{drawing_no}/bom")
def drawing_bom(drawing_no: str) -> list[dict[str, Any]]:
    """도면 BOM — dwg_bom×prt_part (조립순서 assembly_seq 정렬, 부품 상세 ◆ 원천)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        did = _drawing_id(cur, tid, drawing_no)
        cur.execute(
            """SELECT b.bom_id, b.item_no, p.part_no, p.part_name, b.quantity,
                      b.assembly_seq, COALESCE(b.assembly_note,''), p.unit, p.is_standard
               FROM dwg_bom b JOIN prt_part p ON p.part_id=b.part_id
               WHERE b.drawing_id=%s
               ORDER BY COALESCE(b.assembly_seq, 999), b.item_no""", (did,))
        return [
            {"bomId": r[0], "itemNo": r[1], "partNo": r[2], "partName": r[3],
             "qty": float(r[4]), "assemblySeq": r[5], "assemblyNote": r[6],
             "unit": r[7], "isStandard": r[8]}
            for r in cur.fetchall()
        ]


class BomAdd(BaseModel):
    partNo: str
    qty: float = 1
    assemblySeq: int | None = None
    assemblyNote: str = ""


@router.post("/drawings/{drawing_no}/bom", status_code=201, dependencies=[SETUP])
def drawing_bom_add(drawing_no: str, request: Request, body: BomAdd) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        did = _drawing_id(cur, tid, drawing_no)
        cur.execute("SELECT part_id FROM prt_part WHERE tenant_id=%s AND part_no=%s",
                    (tid, body.partNo.strip()))
        p = cur.fetchone()
        if not p:
            raise HTTPException(422, detail=f"부품 없음: {body.partNo} (부품 대장 등록 필요)")
        cur.execute("SELECT 1 FROM dwg_bom WHERE drawing_id=%s AND part_id=%s", (did, p[0]))
        if cur.fetchone():
            raise HTTPException(409, detail=f"이미 BOM 에 있는 부품: {body.partNo}")
        cur.execute("SELECT COALESCE(max(item_no),0)+1 FROM dwg_bom WHERE drawing_id=%s", (did,))
        item_no = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO dwg_bom (drawing_id, part_id, item_no, quantity, assembly_seq, assembly_note)
               VALUES (%s,%s,%s,%s,%s,NULLIF(%s,'')) RETURNING bom_id""",
            (did, p[0], item_no, body.qty, body.assemblySeq, body.assemblyNote.strip()[:500]))
        bom_id = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO sys_history (tenant_id, target_table, target_id, action, actor_id, after_data)
               VALUES (%s,'dwg_bom',%s,'CREATE',%s,%s)""",
            (tid, bom_id, request.state.user_id,
             json.dumps({"drawingNo": drawing_no, "partNo": body.partNo, "qty": body.qty})))
    return {"bomId": bom_id, "itemNo": item_no}


@router.delete("/drawings/{drawing_no}/bom/{bom_id}", dependencies=[SETUP])
def drawing_bom_delete(drawing_no: str, bom_id: int) -> dict[str, Any]:
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        did = _drawing_id(cur, tid, drawing_no)
        cur.execute("DELETE FROM dwg_bom WHERE drawing_id=%s AND bom_id=%s RETURNING bom_id",
                    (did, bom_id))
        if not cur.fetchone():
            raise HTTPException(404, detail=f"BOM 행 없음: #{bom_id}")
    return {"deleted": bom_id}


@router.get("/parts/{part_no}/supplier-codes")
def part_supplier_codes(part_no: str) -> list[dict[str, Any]]:
    """공급자 코드 매핑 (ERP-018) — 부품 기준."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT m.map_id, c.company_name, m.supplier_code, COALESCE(m.supplier_name,'')
               FROM prt_supplier_code_map m
               JOIN prt_part p ON p.part_id=m.part_id
               JOIN com_company c ON c.company_id=m.supplier_id
               WHERE m.tenant_id=%s AND p.part_no=%s ORDER BY m.map_id""", (tid, part_no))
        return [{"mapId": r[0], "supplier": r[1], "supplierCode": r[2], "supplierName": r[3]}
                for r in cur.fetchall()]


class SupplierCodeAdd(BaseModel):
    supplier: str
    supplierCode: str
    supplierName: str = ""


@router.post("/parts/{part_no}/supplier-codes", status_code=201, dependencies=[SETUP])
def part_supplier_code_add(part_no: str, request: Request, body: SupplierCodeAdd) -> dict[str, Any]:
    if not body.supplier.strip() or not body.supplierCode.strip():
        raise HTTPException(422, detail="공급처·공급자 코드는 필수입니다")
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute("SELECT part_id FROM prt_part WHERE tenant_id=%s AND part_no=%s", (tid, part_no))
        p = cur.fetchone()
        if not p:
            raise HTTPException(404, detail=f"부품 없음: {part_no}")
        cur.execute("SELECT company_id FROM com_company WHERE tenant_id=%s AND company_name=%s LIMIT 1",
                    (tid, body.supplier.strip()))
        s = cur.fetchone()
        if s:
            sid = s[0]
        else:
            cur.execute("""INSERT INTO com_company (tenant_id, company_name, company_type)
                           VALUES (%s,%s,'SUPPLIER') RETURNING company_id""", (tid, body.supplier.strip()))
            sid = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO prt_supplier_code_map (tenant_id, part_id, supplier_id, supplier_code,
               supplier_name, created_by) VALUES (%s,%s,%s,%s,NULLIF(%s,''),%s) RETURNING map_id""",
            (tid, p[0], sid, body.supplierCode.strip()[:50], body.supplierName.strip()[:200],
             request.state.login))
        return {"mapId": cur.fetchone()[0]}


@router.get("/codes/{code}/supplier-codes")
def code_supplier_codes(code: str) -> list[dict[str, Any]]:
    """공급자 코드 매핑 — 제품코드 기준 (발주 문서 표시용, 부품 경유 포함)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT m.map_id, c.company_name, m.supplier_code, COALESCE(m.supplier_name,'')
               FROM prt_supplier_code_map m
               JOIN com_company c ON c.company_id=m.supplier_id
               LEFT JOIN prt_part p ON p.part_id=m.part_id
               LEFT JOIN product_code pc
                 ON pc.product_code_id=COALESCE(m.product_code_id, p.product_code_id)
               WHERE m.tenant_id=%s AND pc.main_code=%s ORDER BY m.map_id""", (tid, code))
        return [{"mapId": r[0], "supplier": r[1], "supplierCode": r[2], "supplierName": r[3]}
                for r in cur.fetchall()]


@router.get("/codes/{code}/slot-items")
def code_slot_items(code: str) -> list[dict[str, Any]]:
    """제품코드 필수 슬롯 정의 — product_code_item×code_item (C-1 슬롯 구성의 DB 원천)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            """SELECT i.pc_item_id, i.item_slot, ci.item_name, i.is_required, i.sort_order
               FROM product_code_item i
               JOIN product_code pc ON pc.product_code_id=i.product_code_id AND pc.tenant_id=%s
               JOIN code_item ci ON ci.item_id=i.source_item_id
               WHERE pc.main_code=%s ORDER BY i.sort_order, i.item_slot""", (tid, code))
        return [{"pcItemId": r[0], "slot": r[1], "itemName": r[2], "required": r[3],
                 "sortOrder": r[4]} for r in cur.fetchall()]


@router.get("/codes/{code}/approval-history")
def code_approval_history(code: str) -> list[dict[str, Any]]:
    """코드 승인 이력 — sys_approval_request 실조회 (코드 상세 CODE_APPROVAL_HIST mock 대체).
    product_code 직접 target + comment 라벨 매칭 (범용 승인 요청의 코드 연결)."""
    with _conn() as conn, conn.cursor() as cur:
        tid = _tenant_id(cur)
        cur.execute(
            "SELECT product_code_id FROM product_code WHERE tenant_id=%s AND main_code=%s",
            (tid, code))
        pc = cur.fetchone()
        cur.execute(
            """SELECT a.request_type, a.result, COALESCE(a.comment,''),
                      to_char(a.requested_at,'YYYY-MM-DD'), to_char(a.decided_at,'YYYY-MM-DD'),
                      ru.user_name, au.user_name
               FROM sys_approval_request a
               JOIN sys_user ru ON ru.user_id=a.requester_id
               LEFT JOIN sys_user au ON au.user_id=a.approver_id
               WHERE a.tenant_id=%s AND ((a.target_table='product_code' AND a.target_id=%s)
                     OR a.comment ILIKE %s)
               ORDER BY a.approval_id""",
            (tid, pc[0] if pc else -1, f"%{code}%"))
        rows: list[dict[str, Any]] = []
        for rt, result, comment, req_d, dec_d, req_by, app_by in cur.fetchall():
            rows.append({"date": req_d, "action": f"승인 요청 ({rt})", "by": req_by, "note": comment})
            if result:
                label = "승인 (APPROVED)" if result == "APPROVED" else f"반려 ({result})"
                rows.append({"date": dec_d or req_d, "action": label, "by": app_by or "-", "note": ""})
        return rows

"""PostgreSQL 연결 (EDIM 54-테이블 스키마 — docs/ddl/edim_schema.sql).

DATABASE_URL 미설정/접속 불가 시에도 앱은 뜨고, /api/v1 데이터 엔드포인트만 503.
(프론트는 503/네트워크 오류 시 mock 으로 폴백)
"""
from __future__ import annotations

import logging
import os

from psycopg_pool import ConnectionPool

logger = logging.getLogger("edim.db")

DATABASE_URL = os.getenv("DATABASE_URL", "")

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool | None:
    global _pool
    if not DATABASE_URL:
        return None
    if _pool is None:
        try:
            # 9.16 — launch 동시성 여유. 종전 min=1/max=4 는 PG max_connections=100 대비 지나치게
            # 보수적이라(4%), 다중 사용자 지속 부하에서 큐잉/콜드스타트 병목이 될 수 있었다.
            # min=2(웜 유지)·max=12(동시 12, PG 의 ~12%)로 상향 — 단일 인스턴스에 안전한 범위.
            _pool = ConnectionPool(
                DATABASE_URL, min_size=2, max_size=12,
                kwargs={"autocommit": True}, open=True, timeout=5,
            )
            with _pool.connection() as conn:
                conn.execute("SELECT 1")
            logger.info("EDIM DB pool ready")
        except Exception:  # noqa: BLE001 — 기동은 계속, 데이터 API 만 503
            logger.exception("EDIM DB unavailable")
            _pool = None
    return _pool


def db_ok() -> bool:
    pool = get_pool()
    if pool is None:
        return False
    try:
        with pool.connection() as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:  # noqa: BLE001
        return False

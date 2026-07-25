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

# 업무 시간대 — '오늘' 의 기준. PostgreSQL 컨테이너는 Etc/UTC 로 뜨므로 그대로 두면
# 00:00~09:00 KST 사이에 CURRENT_DATE 가 **어제**가 된다. 단가 유효개시일·문서 채번 연도처럼
# 날짜가 업무상 의미를 갖는 곳에서 하루가 밀린다(오류 없이 조용히).
# 세션 단위로만 설정해 같은 PG 인스턴스의 다른 DB·앱에는 영향을 주지 않는다.
BUSINESS_TZ = os.getenv("EDIM_TZ", "Asia/Seoul")

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
            def _configure(conn) -> None:
                # 커넥션마다 세션 시간대를 업무 시간대로 맞춘다 (풀 재사용분 포함)
                conn.execute(f"SET TIME ZONE '{BUSINESS_TZ}'")

            _pool = ConnectionPool(
                DATABASE_URL, min_size=2, max_size=12,
                kwargs={"autocommit": True}, open=True, timeout=5,
                configure=_configure,
            )
            with _pool.connection() as conn:
                conn.execute("SELECT 1")
            logger.info("EDIM DB pool ready (tz=%s)", BUSINESS_TZ)
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

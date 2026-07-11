# -*- coding: utf-8 -*-
"""관측성 (C8) — 구조화 요청 로깅(traceId·지연) + 간이 메트릭.

개발표준 §9 정합: 구조화 JSON 로그 + 요청 상관관계(traceId). PII·시크릿 미로깅.
메트릭은 인메모리(기동 시 리셋) — 프로메테우스 도입 전 간이 지표(INF-07).
"""
import json
import logging
import sys
import time
import uuid
from collections import deque

from starlette.requests import Request

# 전용 stdout 핸들러 — uvicorn 이 서빙 시작 후 로깅을 재구성해도 요청 로그가 확실히 출력되도록
# (propagate=False 로 root/uvicorn 설정과 독립)
_log = logging.getLogger("edim.req")
if not _log.handlers:
    _h = logging.StreamHandler(sys.stdout)
    _h.setFormatter(logging.Formatter("%(message)s"))
    _log.addHandler(_h)
    _log.setLevel(logging.INFO)
    _log.propagate = False


class Metrics:
    def __init__(self) -> None:
        self.started = time.time()
        self.requests = 0
        self.errors = 0          # 5xx
        self.client_errors = 0   # 4xx
        self.latencies: deque[float] = deque(maxlen=500)  # 최근 500건 (ms)
        self.by_status: dict[int, int] = {}

    def observe(self, status: int, latency_ms: float) -> None:
        self.requests += 1
        self.latencies.append(latency_ms)
        self.by_status[status] = self.by_status.get(status, 0) + 1
        if status >= 500:
            self.errors += 1
        elif status >= 400:
            self.client_errors += 1

    def snapshot(self) -> dict:
        lat = sorted(self.latencies)
        n = len(lat)
        avg = sum(lat) / n if n else 0.0
        p95 = lat[int(n * 0.95)] if n else 0.0
        return {
            "uptimeSec": round(time.time() - self.started, 1),
            "requests": self.requests,
            "errors5xx": self.errors,
            "errors4xx": self.client_errors,
            "errorRate": round(self.errors / self.requests, 4) if self.requests else 0.0,
            "latencyMsAvg": round(avg, 1),
            "latencyMsP95": round(p95, 1),
            "byStatus": dict(sorted(self.by_status.items())),
        }


METRICS = Metrics()


async def observability_middleware(request: Request, call_next):
    """요청별 traceId·지연 구조화 로그 + 메트릭. 5xx & 개발모드면 dev_requirement 자동 접수."""
    trace_id = uuid.uuid4().hex[:8]
    request.state.trace_id = trace_id
    t0 = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        response.headers["X-Trace-Id"] = trace_id
        return response
    finally:
        latency_ms = (time.perf_counter() - t0) * 1000
        METRICS.observe(status, latency_ms)
        # 헬스·메트릭 폴링은 로그 소음 → INFO 생략(집계는 함)
        path = request.url.path
        if not path.endswith(("/health", "/metrics")):
            _log.info(json.dumps({
                "traceId": trace_id, "method": request.method, "path": path,
                "status": status, "latencyMs": round(latency_ms, 1),
            }, ensure_ascii=False))
        if status >= 500:
            _log.error(json.dumps({
                "traceId": trace_id, "event": "server_error",
                "method": request.method, "path": path, "latencyMs": round(latency_ms, 1),
            }, ensure_ascii=False))
            _auto_file_bug(trace_id, request.method, path, status)


def _auto_file_bug(trace_id: str, method: str, path: str, status: int) -> None:
    """개발서버(EDIM_DEV_MODE=1)에서만 — 5xx 발생 시 dev_requirement 자동 접수(BUG)."""
    import os

    if os.getenv("EDIM_DEV_MODE", "") != "1":
        return
    try:
        from app.db import get_pool
        pool = get_pool()
        if pool is None:
            return
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT tenant_id FROM sys_tenant ORDER BY tenant_id LIMIT 1")
            row = cur.fetchone()
            tid = row[0] if row else 1
            # 동일 경로 미해결 자동버그 중복 방지
            cur.execute(
                """SELECT 1 FROM dev_requirement
                   WHERE category='BUG' AND status='OPEN' AND title=%s LIMIT 1""",
                (f"[auto] 5xx {method} {path}"[:200],))
            if cur.fetchone():
                return
            cur.execute(
                """INSERT INTO dev_requirement (tenant_id, category, title, content,
                   priority, status, requester)
                   VALUES (%s,'BUG',%s,%s,'P1','OPEN','system')""",
                (tid, f"[auto] 5xx {method} {path}"[:200],
                 f"traceId={trace_id} status={status} — 서버 오류 자동 접수(C8 관측성)"))
    except Exception:  # noqa: BLE001
        _log.getChild("autobug").debug("auto bug-file skipped")

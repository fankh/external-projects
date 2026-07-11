import logging
import pathlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import edim, export, generate, health, models, upload
from app.services.edim_seed import run_seed

logging.basicConfig(level=logging.INFO)


def _migrate() -> None:
    """C6 — alembic 마이그레이션 (자동 베이스라인).

    기존 DB(핵심 테이블 존재·alembic 미도입) → base 재실행 방지 위해 head 로 stamp.
    신규 DB → upgrade head 로 전체 스키마 생성. DB 불가 시 조용히 skip(앱은 뜸).
    """
    from alembic import command
    from alembic.config import Config

    from app.db import get_pool
    log = logging.getLogger("edim")
    pool = get_pool()
    if pool is None:
        log.warning("migration skipped — DB unavailable")
        return
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT to_regclass('public.alembic_version') IS NOT NULL")
        has_version = cur.fetchone()[0]
        cur.execute("SELECT to_regclass('public.sys_tenant') IS NOT NULL")
        has_core = cur.fetchone()[0]
    cfg = Config(str(pathlib.Path(__file__).resolve().parent.parent / "alembic.ini"))
    cfg.set_main_option("script_location",
                        str(pathlib.Path(__file__).resolve().parent.parent / "alembic"))
    if has_core and not has_version:
        command.stamp(cfg, "head")   # 기존 DB 베이스라인
        log.info("alembic — 기존 DB stamp head (베이스라인)")
    else:
        command.upgrade(cfg, "head")  # 신규/증분
        log.info("alembic — upgrade head")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        _migrate()  # C6 — 스키마는 마이그레이션이 담당
    except Exception:  # noqa: BLE001
        logging.getLogger("edim").exception("migration failed (continuing)")
    try:
        run_seed()  # 멱등 — 데이터만 (nova tenant 있으면 skip)
    except Exception:  # noqa: BLE001
        logging.getLogger("edim").exception("seed failed (continuing)")
    yield


app = FastAPI(title="edim-ai-blueprint", version="0.2.0", lifespan=lifespan)

# C8 — 구조화 요청 로깅(traceId·지연) + 메트릭 미들웨어
from app.observability import METRICS, observability_middleware  # noqa: E402

app.middleware("http")(observability_middleware)


@app.get("/api/v1/metrics", tags=["health"])
def metrics() -> dict:
    """간이 관측성 메트릭 (C8 / INF-07) — 요청 수·오류율·지연(avg/p95)·상태별. 인메모리."""
    return METRICS.snapshot()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(models.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(generate.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(edim.router)  # /api/v1 — EDIM 실 DB

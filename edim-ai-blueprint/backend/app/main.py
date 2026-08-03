import logging
import pathlib
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg.errors import UniqueViolation

from app.routers import edim, export, generate, health, models, upload
from app.services.edim_seed import run_seed

logging.basicConfig(level=logging.INFO)

# 18.37 — 기동 시 마이그레이션 결과. /health 로 드러내 배포가 판단할 수 있게 한다.
# "unknown" 은 아직 시도 전(정상 기동 중)이고, "error" 는 스키마가 코드와 어긋난 상태다.
SCHEMA_STATE: dict[str, str] = {"state": "unknown", "detail": ""}


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
        SCHEMA_STATE["state"] = "head"
    except Exception as e:  # noqa: BLE001
        # 18.37 — 실패해도 앱은 띄운다(가용성). 다만 **조용히 넘기지 않는다**:
        # 종전에는 예외를 로그에만 남겨 /health 가 그대로 ok 를 돌려줬고, 배포 게이트도
        # 통과해 **코드와 스키마가 어긋난 채로 운영**됐다(0060 이 실제로 그렇게 넘어갔다).
        # 상태를 드러내 배포 쪽이 판단하게 한다.
        SCHEMA_STATE["state"] = "error"
        SCHEMA_STATE["detail"] = str(e)[:200]
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

# 1.2 — 멀티테넌시: 토큰의 테넌트를 요청 문맥에 심는다 (동기 엔드포인트까지 전파)
from app.routers.edim import TenantContextMiddleware  # noqa: E402

app.add_middleware(TenantContextMiddleware)


# 19.19 — **고유 제약 위반은 500 이 아니라 409 다.**
#
# 중복 생성은 거의 모든 등록 화면이 사전 검사(SELECT → 409)로 막지만, 검사와 INSERT 사이에는
# 창이 있다. 동시 요청은 서로의 미커밋 행을 볼 수 없으므로 **사전 검사로는 닫을 수 없는 창**
# 이고, 최종 방어는 DB 제약이다. 문제는 그때 나가는 응답이었다 — 혼자 눌렀을 때는 409 로
# 안내하고 동시에 눌렸을 때만 500 이 나가면, 같은 행위가 상황에 따라 다른 얼굴을 보인다.
#
# 19.8 에서 제품 코드 조합 한 곳을 고쳤는데, 전수로 세어 보니 '중복 409 + INSERT' 핸들러
# **34개 중 31개가 무보호**였다. 31곳에 같은 try/except 를 흩뿌리면 언젠가 갈라지므로
# (19.6·19.14 에서 이미 겪었다) **한 곳에서** 변환한다.
@app.exception_handler(UniqueViolation)
async def _unique_violation(request: Request, exc: UniqueViolation) -> JSONResponse:
    diag = getattr(exc, "diag", None)
    where = getattr(diag, "constraint_name", None) or getattr(diag, "table_name", None) or ""
    logging.getLogger("edim").warning("unique violation → 409 (%s) %s", where, request.url.path)
    return JSONResponse(
        status_code=409,
        content={"detail": "이미 같은 값이 등록되어 있습니다 — 동시에 만들어졌을 수 있습니다"
                           + (f" (제약: {where})" if where else "")})


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

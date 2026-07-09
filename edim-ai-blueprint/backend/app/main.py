import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import edim, export, generate, health, models, upload
from app.services.edim_seed import run_seed

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        run_seed()  # 멱등 — nova tenant 있으면 skip
    except Exception:  # noqa: BLE001
        logging.getLogger("edim").exception("seed failed (continuing)")
    yield


app = FastAPI(title="edim-ai-blueprint", version="0.2.0", lifespan=lifespan)

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

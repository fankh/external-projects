from contextlib import asynccontextmanager
from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import FastAPI
from prometheus_client import make_asgi_app
from fastapi.middleware.cors import CORSMiddleware

from src.api.agents import router as agents_router
from src.api.completions import router as completions_router
from src.api.quality import router as quality_router
from src.api.cache import router as cache_router
from src.api.summarize import router as summarize_router
from src.api.query_optimizer import router as query_optimizer_router
from src.api.persona_recommender import router as persona_recommender_router
from src.api.injection_detector import router as injection_detector_router
from src.api.sentiment import router as sentiment_router
from src.api.autoscaler import router as autoscaler_router
from src.api.memory import router as memory_router
from src.api.security import router as security_router
from src.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialize and tear down application resources."""
    app.state.redis = aioredis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
    )
    try:
        await app.state.redis.ping()
    except Exception:
        app.state.redis = None

    # Initialize semantic cache
    app.state.semantic_cache = None
    if app.state.redis is not None:
        try:
            from src.services.semantic_cache import SemanticCache
            async def _embed(text: str) -> list[float]:
                # Use a simple hash-based pseudo-embedding for now (swap for real model later)
                import hashlib, struct
                h = hashlib.sha512(text.encode()).digest()
                return [float(x) / 255.0 for x in h[:64]]
            app.state.semantic_cache = SemanticCache(app.state.redis, _embed)
        except Exception:
            pass

    yield

    if app.state.redis is not None:
        await app.state.redis.aclose()


app = FastAPI(
    title="KYRA AI Guardrail - ML Inference Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router)
app.include_router(completions_router)
app.include_router(quality_router)
app.include_router(cache_router)
app.include_router(summarize_router)
app.include_router(query_optimizer_router)
app.include_router(persona_recommender_router)
app.include_router(injection_detector_router)
app.include_router(sentiment_router)
app.include_router(autoscaler_router)
app.include_router(memory_router)
app.include_router(security_router)
app.mount("/metrics", make_asgi_app())


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    redis_status = "disconnected"
    if app.state.redis is not None:
        try:
            await app.state.redis.ping()
            redis_status = "connected"
        except Exception:
            redis_status = "error"

    return {"status": "ok", "redis": redis_status}

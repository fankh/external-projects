import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from prometheus_client import Counter, Histogram
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI

from src.config import settings
from src.models.schemas import (
    CompletionRequest,
    CompletionResponse,
    EmbeddingRequest,
    EmbeddingResponse,
    ModelInfo,
    StreamChunk,
)
from src.services.cache import ResponseCache
from src.services.llm import LLMService
from src.services.router import ModelRouter

logger = logging.getLogger(__name__)
_llm_tokens = Counter("kyra_llm_tokens_total", "LLM tokens consumed", labelnames=("provider", "model", "kind"))
_llm_calls = Counter("kyra_llm_calls_total", "LLM calls", labelnames=("provider", "model", "result"))
_llm_latency = Histogram("kyra_llm_latency_seconds", "LLM call latency", labelnames=("provider", "model"))

router = APIRouter(prefix="/v1")

# Singleton-ish service instances (created on first use)
_llm_service: LLMService | None = None


def _get_llm_service(request: Request) -> LLMService:
    """Lazily initialise and return the LLM service."""
    global _llm_service
    if _llm_service is None:
        model_router = ModelRouter()
        redis_client = getattr(request.app.state, "redis", None)
        cache = ResponseCache(redis_client=redis_client, default_ttl=settings.CACHE_TTL)
        _llm_service = LLMService(router=model_router, cache=cache)
    return _llm_service


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@router.post("/completions", response_model=CompletionResponse)
async def create_completion(
    body: CompletionRequest, request: Request
) -> CompletionResponse:
    """Generate a non-streaming LLM completion."""
    import time as _time
    service = _get_llm_service(request)
    provider = getattr(body, "provider", "unknown") or "unknown"
    model = getattr(body, "model", "unknown") or "unknown"
    start = _time.perf_counter()
    try:
        result = await service.generate(body)
        # Emit metrics on success
        try:
            usage = getattr(result, "usage", None) or {}
            if isinstance(usage, dict):
                pt = int(usage.get("prompt_tokens", 0) or 0)
                ct = int(usage.get("completion_tokens", 0) or 0)
                if pt: _llm_tokens.labels(provider=provider, model=model, kind="prompt").inc(pt)
                if ct: _llm_tokens.labels(provider=provider, model=model, kind="completion").inc(ct)
            _llm_calls.labels(provider=provider, model=model, result="ok").inc()
        except Exception:
            pass
        return result
    except ValueError as exc:
        _llm_calls.labels(provider=provider, model=model, result="client_error").inc()
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        _llm_calls.labels(provider=provider, model=model, result="server_error").inc()
        logger.exception("Completion failed")
        raise HTTPException(status_code=502, detail=f"LLM provider error: {exc}")
    finally:
        _llm_latency.labels(provider=provider, model=model).observe(_time.perf_counter() - start)


@router.post("/completions/stream")
async def create_completion_stream(
    body: CompletionRequest, request: Request
) -> StreamingResponse:
    """Generate a streaming LLM completion via Server-Sent Events."""
    service = _get_llm_service(request)

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            async for chunk in service.generate_stream(body):
                payload = chunk.model_dump_json()
                yield f"data: {payload}\n\n"
        except ValueError as exc:
            error_chunk = StreamChunk(type="error", content=str(exc))
            yield f"data: {error_chunk.model_dump_json()}\n\n"
        except Exception as exc:
            logger.exception("Stream failed")
            error_chunk = StreamChunk(type="error", content=f"LLM provider error: {exc}")
            yield f"data: {error_chunk.model_dump_json()}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/models", response_model=list[ModelInfo])
async def list_models() -> list[ModelInfo]:
    """List all available models."""
    model_router = ModelRouter()
    return model_router.list_models()


@router.post("/embeddings", response_model=EmbeddingResponse)
async def create_embeddings(body: EmbeddingRequest) -> EmbeddingResponse:
    """Generate text embeddings via OpenAI."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    try:
        response = await client.embeddings.create(
            model=body.model,
            input=body.texts,
        )
        embeddings = [item.embedding for item in response.data]
        try:
            _llm_tokens.labels(provider="openai", model=body.model, kind="embedding").inc(int(response.usage.prompt_tokens or 0))
            _llm_calls.labels(provider="openai", model=body.model, result="ok").inc()
        except Exception:
            pass
        return EmbeddingResponse(
            embeddings=embeddings,
            model=response.model,
            usage={
                "prompt_tokens": response.usage.prompt_tokens,
                "total_tokens": response.usage.total_tokens,
            },
        )
    except Exception as exc:
        logger.exception("Embedding generation failed")
        raise HTTPException(status_code=502, detail=f"Embedding error: {exc}")

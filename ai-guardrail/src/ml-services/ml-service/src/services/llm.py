import logging
from typing import AsyncGenerator

from src.models.schemas import CompletionRequest, CompletionResponse, StreamChunk
from src.services.cache import ResponseCache
from src.services.router import ModelRouter

logger = logging.getLogger(__name__)


class LLMService:
    """Orchestrates LLM inference with routing, caching, and fallback."""

    def __init__(self, router: ModelRouter, cache: ResponseCache) -> None:
        self._router = router
        self._cache = cache

    async def generate(self, request: CompletionRequest) -> CompletionResponse:
        """Generate a non-streaming completion with caching and fallback."""
        # 1. Check cache for deterministic requests
        if request.temperature == 0.0:
            cached = await self._cache.get(request)
            if cached is not None:
                return cached

        # 2. Route and call provider
        try:
            response = await self._call_provider(request.model, request)
        except Exception as exc:
            logger.error("Primary model %s failed: %s", request.model, exc)
            # 5. Fallback
            fallback = self._router.get_fallback(request.model)
            if fallback is None:
                raise
            logger.info("Falling back from %s to %s", request.model, fallback)
            response = await self._call_provider(fallback, request)

        # 4. Cache if deterministic
        if request.temperature == 0.0:
            await self._cache.set(request, response)

        return response

    async def generate_stream(
        self, request: CompletionRequest
    ) -> AsyncGenerator[StreamChunk, None]:
        """Generate a streaming completion with fallback on error."""
        model = request.model
        try:
            async for chunk in self._stream_provider(model, request):
                yield chunk
        except Exception as exc:
            logger.error("Streaming from %s failed: %s", model, exc)
            fallback = self._router.get_fallback(model)
            if fallback is None:
                yield StreamChunk(type="error", content=str(exc))
                return
            logger.info("Stream falling back from %s to %s", model, fallback)
            try:
                async for chunk in self._stream_provider(fallback, request):
                    yield chunk
            except Exception as fallback_exc:
                yield StreamChunk(type="error", content=str(fallback_exc))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _call_provider(
        self, model_name: str, request: CompletionRequest
    ) -> CompletionResponse:
        provider_name, model_id = self._router.route(model_name)
        provider = self._router.get_provider(provider_name)
        result = await provider.complete(
            messages=request.messages,
            model=model_id,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            top_p=request.top_p,
            stop=request.stop,
        )
        return CompletionResponse(
            content=result.content,
            model=model_name,
            tokens={"prompt": result.prompt_tokens, "completion": result.completion_tokens},
            finish_reason=result.finish_reason,
        )

    async def _stream_provider(
        self, model_name: str, request: CompletionRequest
    ) -> AsyncGenerator[StreamChunk, None]:
        provider_name, model_id = self._router.route(model_name)
        provider = self._router.get_provider(provider_name)

        has_done = False
        async for chunk_data in provider.stream(
            messages=request.messages,
            model=model_id,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            top_p=request.top_p,
            stop=request.stop,
        ):
            chunk = StreamChunk(**chunk_data)
            if chunk.type == "done":
                has_done = True
            yield chunk

        # Ensure a final done chunk is always emitted
        if not has_done:
            yield StreamChunk(type="done", finish_reason="stop")

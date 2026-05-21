"""Semantic response cache API."""
from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/cache", tags=["cache"])


class CacheLookupRequest(BaseModel):
    query: str
    model: str = ""


class CachePutRequest(BaseModel):
    query: str
    response: str
    model: str = ""


@router.post("/lookup")
async def cache_lookup(body: CacheLookupRequest, request: Request):
    """Check if a cached response exists for this query."""
    cache = request.app.state.semantic_cache
    if cache is None:
        return {"hit": False, "reason": "cache not initialized"}
    result = await cache.get(body.query, model=body.model)
    if result:
        return {"hit": True, **result}
    return {"hit": False}


@router.post("/store")
async def cache_store(body: CachePutRequest, request: Request):
    """Manually store a response in the cache."""
    cache = request.app.state.semantic_cache
    if cache is None:
        return {"stored": False, "reason": "cache not initialized"}
    await cache.put(body.query, body.response, model=body.model)
    return {"stored": True}


@router.get("/stats")
async def cache_stats(request: Request):
    """Cache occupancy stats."""
    cache = request.app.state.semantic_cache
    if cache is None:
        return {"error": "cache not initialized"}
    return await cache.stats()


@router.post("/flush")
async def cache_flush(request: Request):
    """Flush all cache entries."""
    cache = request.app.state.semantic_cache
    if cache is None:
        return {"flushed": False}
    await cache.flush()
    return {"flushed": True}

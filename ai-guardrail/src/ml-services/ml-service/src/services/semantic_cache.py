"""
Semantic response cache.

L1: exact-hash match (SHA-256 of normalized query) → instant.
L2: embedding-similarity match (cosine > threshold) → near-instant.

Stored in Redis as:
  - Hash "kyra:scache:exact:{sha256}"  →  {response, ts, model}
  - Sorted set "kyra:scache:emb"       →  score=cosine, member=json(embedding+meta)

L2 uses brute-force scan over the sorted set. For < 10K entries this is < 10ms.
Migrate to Milvus or pgvector for larger scale.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Optional

import numpy as np
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

_EXACT_PREFIX = "kyra:scache:exact:"
_EMB_KEY = "kyra:scache:emb"
_DEFAULT_TTL = 3600  # 1 hour


def _normalize(q: str) -> str:
    return " ".join(q.lower().split())


def _hash(q: str) -> str:
    return hashlib.sha256(_normalize(q).encode()).hexdigest()


class SemanticCache:
    def __init__(self, redis: aioredis.Redis, embed_fn, *, similarity_threshold: float = 0.85, ttl: int = _DEFAULT_TTL):
        self.redis = redis
        self.embed_fn = embed_fn  # async fn(text) -> list[float]
        self.threshold = similarity_threshold
        self.ttl = ttl

    async def get(self, query: str, *, model: str = "") -> Optional[dict]:
        """Look up cache. Returns {response, model, cache_level, latency_ms} or None."""
        t0 = time.perf_counter()
        qn = _normalize(query)
        qh = _hash(qn)

        # L1 exact
        raw = await self.redis.get(_EXACT_PREFIX + qh)
        if raw:
            entry = json.loads(raw)
            entry["cache_level"] = "L1_exact"
            entry["latency_ms"] = round((time.perf_counter() - t0) * 1000, 2)
            return entry

        # L2 embedding similarity
        try:
            q_emb = await self.embed_fn(qn)
            q_vec = np.array(q_emb, dtype=np.float32)
            q_norm = np.linalg.norm(q_vec)
            if q_norm == 0:
                return None

            members = await self.redis.zrangebyscore(_EMB_KEY, "-inf", "+inf", withscores=False)
            best_score = 0.0
            best_entry = None
            for m in members:
                entry = json.loads(m)
                c_vec = np.array(entry["embedding"], dtype=np.float32)
                c_norm = np.linalg.norm(c_vec)
                if c_norm == 0:
                    continue
                cos = float(np.dot(q_vec, c_vec) / (q_norm * c_norm))
                if cos > best_score:
                    best_score = cos
                    best_entry = entry
            if best_score >= self.threshold and best_entry:
                result = {"response": best_entry["response"], "model": best_entry.get("model", ""),
                          "cache_level": "L2_semantic", "similarity": round(best_score, 4),
                          "latency_ms": round((time.perf_counter() - t0) * 1000, 2)}
                return result
        except Exception as exc:
            logger.debug("L2 cache lookup failed: %s", exc)

        return None

    async def put(self, query: str, response: str, *, model: str = ""):
        """Store a query-response pair in both L1 and L2."""
        qn = _normalize(query)
        qh = _hash(qn)

        # L1
        entry = {"response": response, "model": model, "ts": time.time()}
        await self.redis.setex(_EXACT_PREFIX + qh, self.ttl, json.dumps(entry))

        # L2
        try:
            emb = await self.embed_fn(qn)
            l2_entry = {"embedding": emb, "response": response, "model": model,
                        "query_hash": qh, "ts": time.time()}
            await self.redis.zadd(_EMB_KEY, {json.dumps(l2_entry): time.time()})
        except Exception as exc:
            logger.debug("L2 cache put failed: %s", exc)

    async def stats(self) -> dict:
        exact_count = 0
        cursor = b"0"
        while True:
            cursor, keys = await self.redis.scan(cursor=cursor, match=_EXACT_PREFIX + "*", count=1000)
            exact_count += len(keys)
            if cursor == b"0" or cursor == 0:
                break
        l2_count = await self.redis.zcard(_EMB_KEY)
        return {"exact_entries": exact_count, "semantic_entries": l2_count, "ttl_seconds": self.ttl,
                "similarity_threshold": self.threshold}

    async def flush(self):
        cursor = b"0"
        while True:
            cursor, keys = await self.redis.scan(cursor=cursor, match=_EXACT_PREFIX + "*", count=1000)
            if keys:
                await self.redis.delete(*keys)
            if cursor == b"0" or cursor == 0:
                break
        await self.redis.delete(_EMB_KEY)

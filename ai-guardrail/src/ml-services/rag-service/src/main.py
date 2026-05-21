import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from prometheus_client import make_asgi_app
from fastapi.middleware.cors import CORSMiddleware
from pymilvus import connections

from src.config import settings

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Singleton service instances (initialised during lifespan)
# ---------------------------------------------------------------------------
_embedding_service = None
_indexing_service = None
_search_service = None
_storage_service = None
_hybrid_search_service = None


def get_embedding_service():
    from src.services.embedding import EmbeddingService
    return _embedding_service


def get_indexing_service():
    from src.services.indexing import IndexingService
    return _indexing_service


def get_search_service():
    from src.services.search import SearchService
    return _search_service


def get_storage_service():
    from src.services.storage import StorageService
    return _storage_service


def get_hybrid_search_service():
    from src.services.hybrid_search import HybridSearchService
    return _hybrid_search_service


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _embedding_service, _indexing_service, _search_service, _storage_service, _hybrid_search_service

    logger.info("Starting RAG service ...")

    # 1. Connect to Milvus
    try:
        connections.connect(
            alias="default",
            host=settings.MILVUS_HOST,
            port=str(settings.MILVUS_PORT),
        )
        logger.info("Connected to Milvus at %s:%s", settings.MILVUS_HOST, settings.MILVUS_PORT)
    except Exception as exc:
        logger.warning("Milvus connection failed (will retry on first use): %s", exc)

    # 2. Load embedding model
    from src.services.embedding import EmbeddingService

    _embedding_service = EmbeddingService()

    # 3. Initialise services
    from src.services.chunking import ChunkingService
    from src.services.indexing import IndexingService
    from src.services.search import SearchService
    from src.services.storage import StorageService

    _indexing_service = IndexingService(
        embedding_service=_embedding_service,
        chunking_service=ChunkingService(),
    )
    _search_service = SearchService(embedding_service=_embedding_service)

    # 3b. Advanced pipeline services
    from src.services.citations import CitationService
    from src.services.hybrid_search import HybridSearchService
    from src.services.query_enhancement import QueryEnhancementService
    from src.services.reranker import RerankerService

    _hybrid_search_service = HybridSearchService(
        search_service=_search_service,
        embedding_service=_embedding_service,
        query_enhancement_service=QueryEnhancementService(embedding_service=_embedding_service),
        reranker_service=RerankerService(),
        citation_service=CitationService(),
    )
    logger.info("Advanced hybrid search pipeline initialised")

    try:
        _storage_service = StorageService()
        logger.info("MinIO storage service initialised")
    except Exception as exc:
        logger.warning("MinIO connection failed (will retry on first use): %s", exc)

    # 4. Database tables (optional auto-create for dev)
    try:
        from src.db import engine
        from src.models.database import Base

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables verified/created")
    except Exception as exc:
        logger.warning("Database init skipped: %s", exc)

    logger.info("RAG service ready on port %d", settings.SERVICE_PORT)

    yield

    # Shutdown
    try:
        connections.disconnect("default")
    except Exception:
        pass
    logger.info("RAG service stopped")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="KYRA AI Guardrail - RAG Service",
    description="Document ingestion, chunking, embedding, and vector search",
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

# Routers
from src.api.collections import router as collections_router
from src.api.documents import router as documents_router
from src.api.search import router as search_router
from src.api.advanced_search import router as advanced_search_router

app.include_router(collections_router)
from src.api.connectors import router as connectors_router
from src.api.rerank import router as rerank_router
from src.api.self_query import router as self_query_router
app.include_router(connectors_router)
app.include_router(rerank_router)
app.include_router(self_query_router)
app.include_router(documents_router)
app.include_router(search_router)
app.include_router(advanced_search_router)
app.mount("/metrics", make_asgi_app())


@app.get("/health", tags=["system"])
async def health() -> dict:
    """Health check endpoint."""
    milvus_ok = False
    try:
        from pymilvus import utility

        utility.list_collections()
        milvus_ok = True
    except Exception:
        pass

    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "embedding_model": settings.EMBEDDING_MODEL,
        "embedding_dimension": _embedding_service.dimension if _embedding_service else None,
        "milvus_connected": milvus_ok,
    }

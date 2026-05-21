import logging
from dataclasses import asdict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.services.memory_extraction import MemoryExtractionService
from src.services.memory_consolidation import MemoryConsolidationService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/memory")

# Singleton-ish service instances (created on first use)
_extraction_service: MemoryExtractionService | None = None
_consolidation_service: MemoryConsolidationService | None = None


def _get_extraction_service() -> MemoryExtractionService:
    global _extraction_service
    if _extraction_service is None:
        _extraction_service = MemoryExtractionService()
    return _extraction_service


def _get_consolidation_service() -> MemoryConsolidationService:
    global _consolidation_service
    if _consolidation_service is None:
        _consolidation_service = MemoryConsolidationService()
    return _consolidation_service


# ------------------------------------------------------------------
# Request / Response schemas
# ------------------------------------------------------------------


class ExtractRequest(BaseModel):
    """Request body for memory extraction."""

    messages: list[dict] = Field(..., min_length=1)


class ExtractResponse(BaseModel):
    """Response body for memory extraction."""

    memories: list[dict]


class ConsolidateRequest(BaseModel):
    """Request body for memory consolidation."""

    memories: list[dict] = Field(..., min_length=1)


class ConsolidateResponse(BaseModel):
    """Response body for memory consolidation."""

    merged: list[dict]
    archived: list[str]
    unchanged: list[str]


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@router.post("/extract", response_model=ExtractResponse)
async def extract_memories(body: ExtractRequest) -> ExtractResponse:
    """Extract memories from conversation messages."""
    service = _get_extraction_service()
    try:
        extracted = await service.extract(body.messages)
        memories = [asdict(m) for m in extracted]
        return ExtractResponse(memories=memories)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Memory extraction failed")
        raise HTTPException(status_code=502, detail=f"Extraction error: {exc}")


@router.post("/consolidate", response_model=ConsolidateResponse)
async def consolidate_memories(body: ConsolidateRequest) -> ConsolidateResponse:
    """Consolidate a list of memories."""
    service = _get_consolidation_service()
    try:
        result = await service.consolidate(body.memories)
        return ConsolidateResponse(
            merged=result.merged,
            archived=result.archived,
            unchanged=result.unchanged,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Memory consolidation failed")
        raise HTTPException(status_code=502, detail=f"Consolidation error: {exc}")

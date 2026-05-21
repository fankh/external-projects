from fastapi import APIRouter

from src.models.schemas import SearchRequest, SearchResponse

router = APIRouter(prefix="/v1/rag", tags=["search"])


@router.post("/search", response_model=SearchResponse)
async def search(body: SearchRequest) -> SearchResponse:
    """Search across collections using vector similarity."""
    from src.main import get_search_service

    search_service = get_search_service()
    results, query_time_ms = await search_service.search(
        collection_ids=body.collection_ids,
        query=body.query,
        limit=body.limit,
        min_score=body.min_score,
        filters=body.filters,
        expand_to_parent=body.expand_to_parent,
    )
    return SearchResponse(
        results=results,
        total=len(results),
        query_time_ms=query_time_ms,
    )

from datetime import datetime

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Collections
# ---------------------------------------------------------------------------

class CollectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    access_level: str = Field(default="private", pattern="^(private|team|public)$")


class CollectionResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    document_count: int = 0
    chunk_count: int = 0
    total_size_bytes: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class DocumentResponse(BaseModel):
    id: str
    collection_id: str
    title: str | None = None
    file_name: str
    file_type: str
    file_size_bytes: int
    status: str
    chunk_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    collection_ids: list[str] = Field(..., min_length=1)
    limit: int = Field(default=10, ge=1, le=100)
    min_score: float = Field(default=0.7, ge=0.0, le=1.0)
    filters: dict | None = None


    expand_to_parent: bool = False

class SearchResult(BaseModel):
    document_id: str
    document_name: str
    chunk_content: str
    chunk_index: int
    score: float
    page_number: int | None = None
    section_title: str | None = None


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int
    query_time_ms: float

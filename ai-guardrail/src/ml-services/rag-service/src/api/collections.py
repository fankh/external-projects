import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_session
from src.models.database import Collection as DBCollection
from src.models.schemas import CollectionCreate, CollectionResponse

router = APIRouter(prefix="/v1/collections", tags=["collections"])


@router.get("/", response_model=list[CollectionResponse])
async def list_collections(
    access_level: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[CollectionResponse]:
    """List all collections, optionally filtered by access_level."""
    stmt = select(DBCollection).order_by(DBCollection.created_at.desc())
    if access_level:
        stmt = stmt.where(DBCollection.access_level == access_level)
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [
        CollectionResponse(
            id=str(r.id),
            name=r.name,
            description=r.description,
            document_count=r.document_count,
            chunk_count=r.chunk_count,
            total_size_bytes=r.total_size_bytes,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    body: CollectionCreate,
    session: AsyncSession = Depends(get_session),
) -> CollectionResponse:
    """Create a new document collection."""
    col = DBCollection(
        name=body.name,
        description=body.description,
        access_level=body.access_level,
    )
    session.add(col)
    await session.flush()
    await session.refresh(col)
    return CollectionResponse(
        id=str(col.id),
        name=col.name,
        description=col.description,
        document_count=col.document_count,
        chunk_count=col.chunk_count,
        total_size_bytes=col.total_size_bytes,
        created_at=col.created_at,
    )


@router.get("/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: str,
    session: AsyncSession = Depends(get_session),
) -> CollectionResponse:
    """Get a single collection by ID."""
    col = await session.get(DBCollection, uuid.UUID(collection_id))
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    return CollectionResponse(
        id=str(col.id),
        name=col.name,
        description=col.description,
        document_count=col.document_count,
        chunk_count=col.chunk_count,
        total_size_bytes=col.total_size_bytes,
        created_at=col.created_at,
    )


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a collection and all its documents/vectors."""
    col = await session.get(DBCollection, uuid.UUID(collection_id))
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Drop Milvus collection (import here to avoid circular at module level)
    from src.main import get_indexing_service

    indexing = get_indexing_service()
    indexing.drop_collection_vectors(collection_id)

    await session.delete(col)

import io
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_session, async_session_factory
from src.models.database import Collection as DBCollection
from src.models.database import Document as DBDocument
from src.models.schemas import DocumentResponse
from src.utils.parsers import parse_file

router = APIRouter(prefix="/v1/documents", tags=["documents"])


# ------------------------------------------------------------------
# Background task: index a document
# ------------------------------------------------------------------

async def _index_document_task(
    document_id: str,
    collection_id: str,
    file_name: str,
    file_data: bytes,
) -> None:
    """Run chunking + embedding + Milvus insertion in background."""
    from src.main import get_indexing_service

    async with async_session_factory() as session:
        try:
            content = parse_file(file_name, file_data)
            indexing = get_indexing_service()
            await indexing.index_document(
                session=session,
                collection_id=collection_id,
                document_id=document_id,
                content=content,
                document_name=file_name,
            )
        except Exception as exc:
            import logging

            logging.getLogger(__name__).exception(
                "Failed to index document %s: %s", document_id, exc
            )
            doc = await session.get(DBDocument, uuid.UUID(document_id))
            if doc:
                doc.status = "failed"
                await session.commit()


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

@router.post(
    "/collections/{collection_id}/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_document(
    collection_id: str,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> DocumentResponse:
    """Upload a file, store in MinIO, and trigger async indexing."""
    # Validate collection exists
    col = await session.get(DBCollection, uuid.UUID(collection_id))
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Read file content
    file_data = await file.read()
    file_size = len(file_data)
    file_name = file.filename or "untitled"
    file_type = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "unknown"

    # Store in MinIO
    from src.main import get_storage_service

    storage = get_storage_service()
    object_name = f"{collection_id}/{uuid.uuid4()}/{file_name}"
    storage.upload_file(
        object_name=object_name,
        data=io.BytesIO(file_data),
        length=file_size,
        content_type=file.content_type or "application/octet-stream",
    )

    # Create DB record
    doc = DBDocument(
        collection_id=uuid.UUID(collection_id),
        title=file_name,
        file_name=file_name,
        file_type=file_type,
        file_size_bytes=file_size,
        status="processing",
        storage_path=object_name,
    )
    session.add(doc)

    # Update collection counters
    col.document_count = (col.document_count or 0) + 1
    col.total_size_bytes = (col.total_size_bytes or 0) + file_size

    await session.flush()
    await session.refresh(doc)

    doc_id = str(doc.id)

    # Schedule background indexing
    background_tasks.add_task(
        _index_document_task,
        document_id=doc_id,
        collection_id=collection_id,
        file_name=file_name,
        file_data=file_data,
    )

    return DocumentResponse(
        id=doc_id,
        collection_id=collection_id,
        title=doc.title,
        file_name=doc.file_name,
        file_type=doc.file_type,
        file_size_bytes=doc.file_size_bytes,
        status=doc.status,
        chunk_count=doc.chunk_count,
        created_at=doc.created_at,
    )


@router.get(
    "/collections/{collection_id}/documents",
    response_model=list[DocumentResponse],
)
async def list_documents(
    collection_id: str,
    session: AsyncSession = Depends(get_session),
) -> list[DocumentResponse]:
    """List all documents in a collection."""
    stmt = (
        select(DBDocument)
        .where(DBDocument.collection_id == uuid.UUID(collection_id))
        .order_by(DBDocument.created_at.desc())
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [
        DocumentResponse(
            id=str(r.id),
            collection_id=str(r.collection_id),
            title=r.title,
            file_name=r.file_name,
            file_type=r.file_type,
            file_size_bytes=r.file_size_bytes,
            status=r.status,
            chunk_count=r.chunk_count,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    session: AsyncSession = Depends(get_session),
) -> DocumentResponse:
    """Get a single document by ID (useful for polling indexing status)."""
    doc = await session.get(DBDocument, uuid.UUID(document_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse(
        id=str(doc.id),
        collection_id=str(doc.collection_id),
        title=doc.title,
        file_name=doc.file_name,
        file_type=doc.file_type,
        file_size_bytes=doc.file_size_bytes,
        status=doc.status,
        chunk_count=doc.chunk_count,
        created_at=doc.created_at,
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a document and its vectors from Milvus."""
    doc = await session.get(DBDocument, uuid.UUID(document_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    collection_id = str(doc.collection_id)

    # Delete vectors from Milvus
    from src.main import get_indexing_service

    indexing = get_indexing_service()
    indexing.delete_document_vectors(collection_id, document_id)

    # Delete from MinIO
    if doc.storage_path:
        from src.main import get_storage_service

        storage = get_storage_service()
        storage.delete_file(doc.storage_path)

    # Update collection counters
    col = await session.get(DBCollection, uuid.UUID(collection_id))
    if col:
        col.document_count = max((col.document_count or 1) - 1, 0)
        col.chunk_count = max((col.chunk_count or 0) - (doc.chunk_count or 0), 0)
        col.total_size_bytes = max(
            (col.total_size_bytes or 0) - (doc.file_size_bytes or 0), 0
        )

    await session.delete(doc)

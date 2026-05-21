import logging
import uuid

from pymilvus import (
    Collection,
    CollectionSchema,
    DataType,
    FieldSchema,
    connections,
    utility,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.database import Collection as DBCollection
from src.models.database import Document as DBDocument
from src.models.database import DocumentChunk as DBDocumentChunk
from src.services.chunking import ChunkingService
from src.services.embedding import EmbeddingService

logger = logging.getLogger(__name__)


class IndexingService:
    """Orchestrates chunking, embedding, and Milvus insertion."""

    def __init__(
        self,
        embedding_service: EmbeddingService,
        chunking_service: ChunkingService | None = None,
    ) -> None:
        self._embedding = embedding_service
        self._chunking = chunking_service or ChunkingService()

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    async def index_document(
        self,
        session: AsyncSession,
        collection_id: str,
        document_id: str,
        content: str,
        document_name: str,
    ) -> int:
        """Chunk, embed, and index a document. Returns the chunk count."""
        # 1. Chunk
        chunks = self._chunking.chunk_document(
            content=content,
            document_id=document_id,
            document_name=document_name,
        )
        if not chunks:
            logger.warning("No chunks produced for document %s", document_id)
            return 0

        # 2. Embed
        texts = [c.content for c in chunks]
        embeddings = self._embedding.embed_texts(texts)

        # 3. Insert into Milvus
        milvus_col = self._get_or_create_milvus_collection(collection_id)

        ids: list[str] = []
        document_ids: list[str] = []
        chunk_indices: list[int] = []
        contents: list[str] = []
        metas: list[dict] = []

        for idx, chunk in enumerate(chunks):
            chunk_uuid = str(uuid.uuid4())
            ids.append(chunk_uuid)
            document_ids.append(document_id)
            chunk_indices.append(idx)
            contents.append(chunk.content[:65535])  # Milvus VARCHAR limit
            metas.append(chunk.metadata)

        milvus_col.insert([ids, document_ids, chunk_indices, contents, embeddings, metas])
        milvus_col.flush()
        logger.info(
            "Inserted %d vectors into Milvus collection col_%s",
            len(ids),
            collection_id,
        )

        # 4. Persist chunks in PostgreSQL
        db_chunks = []
        for idx, chunk in enumerate(chunks):
            db_chunks.append(
                DBDocumentChunk(
                    id=uuid.UUID(ids[idx]),
                    document_id=uuid.UUID(document_id),
                    chunk_index=idx,
                    content=chunk.content,
                    token_count=chunk.token_count,
                    page_number=chunk.metadata.get("page_number"),
                    metadata_=chunk.metadata,
                )
            )
        session.add_all(db_chunks)

        # 5. Update document status
        doc = await session.get(DBDocument, uuid.UUID(document_id))
        if doc:
            doc.status = "indexed"
            doc.chunk_count = len(chunks)

        # 6. Update collection counters
        col = await session.get(DBCollection, uuid.UUID(collection_id))
        if col:
            col.chunk_count = (col.chunk_count or 0) + len(chunks)

        await session.commit()
        return len(chunks)

    # ------------------------------------------------------------------
    # Milvus helpers
    # ------------------------------------------------------------------

    def _get_or_create_milvus_collection(self, collection_id: str) -> Collection:
        """Return (or create) a Milvus collection for the given guardrail collection."""
        col_name = f"col_{collection_id.replace('-', '_')}"

        if utility.has_collection(col_name):
            col = Collection(col_name)
            col.load()
            return col

        dim = self._embedding.dimension
        fields = [
            FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=64),
            FieldSchema(name="document_id", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="chunk_index", dtype=DataType.INT64),
            FieldSchema(name="content", dtype=DataType.VARCHAR, max_length=65535),
            FieldSchema(
                name="embedding",
                dtype=DataType.FLOAT_VECTOR,
                dim=dim,
            ),
            FieldSchema(name="metadata", dtype=DataType.JSON),
        ]
        schema = CollectionSchema(fields=fields, description="RAG document chunks")
        col = Collection(name=col_name, schema=schema)

        index_params = {
            "index_type": "IVF_FLAT",
            "metric_type": "COSINE",
            "params": {"nlist": 128},
        }
        col.create_index(field_name="embedding", index_params=index_params)
        col.load()
        logger.info("Created Milvus collection %s (dim=%d)", col_name, dim)
        return col

    def delete_document_vectors(self, collection_id: str, document_id: str) -> None:
        """Remove all vectors belonging to a document from a Milvus collection."""
        col_name = f"col_{collection_id.replace('-', '_')}"
        if not utility.has_collection(col_name):
            return
        col = Collection(col_name)
        col.load()
        col.delete(expr=f'document_id == "{document_id}"')
        col.flush()
        logger.info(
            "Deleted vectors for document %s from %s", document_id, col_name
        )

    def drop_collection_vectors(self, collection_id: str) -> None:
        """Drop the entire Milvus collection."""
        col_name = f"col_{collection_id.replace('-', '_')}"
        if utility.has_collection(col_name):
            utility.drop_collection(col_name)
            logger.info("Dropped Milvus collection %s", col_name)

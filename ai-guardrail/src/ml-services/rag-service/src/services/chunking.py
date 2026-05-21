import logging
from dataclasses import dataclass, field

from langchain_text_splitters import RecursiveCharacterTextSplitter

from src.config import settings

logger = logging.getLogger(__name__)


@dataclass
class Chunk:
    """Represents a single text chunk produced from a document."""

    content: str
    metadata: dict = field(default_factory=dict)
    token_count: int = 0


class ChunkingService:
    """Splits document text into overlapping chunks."""

    def chunk_document(
        self,
        content: str,
        document_id: str,
        document_name: str,
        chunk_size: int | None = None,
        chunk_overlap: int | None = None,
    ) -> list[Chunk]:
        """Split *content* into chunks and return a list of Chunk objects."""
        chunk_size = chunk_size or settings.CHUNK_SIZE
        chunk_overlap = chunk_overlap or settings.CHUNK_OVERLAP

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        raw_chunks = splitter.split_text(content)
        chunks: list[Chunk] = []

        for idx, text in enumerate(raw_chunks):
            token_count = len(text.split())
            page_number = self._estimate_page_number(content, text)
            chunks.append(
                Chunk(
                    content=text,
                    metadata={
                        "document_id": document_id,
                        "document_name": document_name,
                        "chunk_index": idx,
                        "page_number": page_number,
                    },
                    token_count=token_count,
                )
            )

        logger.info(
            "Chunked document %s into %d chunks (size=%d, overlap=%d)",
            document_id,
            len(chunks),
            chunk_size,
            chunk_overlap,
        )
        return chunks

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _estimate_page_number(
        full_text: str, chunk_text: str, chars_per_page: int = 3000
    ) -> int | None:
        """Rough page-number estimation based on character offset."""
        pos = full_text.find(chunk_text)
        if pos == -1:
            return None
        return (pos // chars_per_page) + 1

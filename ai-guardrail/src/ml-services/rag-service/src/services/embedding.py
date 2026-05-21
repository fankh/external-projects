import logging

from sentence_transformers import SentenceTransformer

from src.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Wraps SentenceTransformer for text embedding."""

    def __init__(self, model_name: str | None = None) -> None:
        model_name = model_name or settings.EMBEDDING_MODEL
        logger.info("Loading embedding model: %s", model_name)
        self._model = SentenceTransformer(model_name)
        self._dimension: int = self._model.get_sentence_embedding_dimension()  # type: ignore[assignment]
        logger.info(
            "Embedding model loaded. Dimension: %d", self._dimension
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Batch-embed a list of texts and return a list of float vectors."""
        embeddings = self._model.encode(
            texts, batch_size=64, show_progress_bar=False, normalize_embeddings=True
        )
        return [vec.tolist() for vec in embeddings]

    def embed_query(self, query: str) -> list[float]:
        """Embed a single query string."""
        embedding = self._model.encode(
            query, show_progress_bar=False, normalize_embeddings=True
        )
        return embedding.tolist()

    @property
    def dimension(self) -> int:
        """Return the embedding vector dimension."""
        return self._dimension

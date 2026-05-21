"""Cross-encoder reranking and Maximal Marginal Relevance (MMR) selection."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Sequence

import numpy as np
from sentence_transformers import CrossEncoder

from src.models.schemas import SearchResult

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"


@lru_cache(maxsize=1)
def _load_cross_encoder(model_name: str) -> CrossEncoder:
    """Load and cache the cross-encoder model (heavy; should only happen once)."""
    logger.info("Loading cross-encoder model: %s", model_name)
    model = CrossEncoder(model_name, max_length=512)
    logger.info("Cross-encoder model loaded")
    return model


class RerankerService:
    """Rerank search results using a cross-encoder and/or MMR diversity selection."""

    def __init__(self, model_name: str = _DEFAULT_MODEL) -> None:
        self._model_name = model_name
        # Lazily loaded on first call
        self._model: CrossEncoder | None = None

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def model(self) -> CrossEncoder:
        if self._model is None:
            self._model = _load_cross_encoder(self._model_name)
        return self._model

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def rerank(
        self,
        query: str,
        results: list[SearchResult],
        top_k: int = 10,
    ) -> list[SearchResult]:
        """Re-score *results* with the cross-encoder and return the top-*k*.

        Each result's ``score`` is **replaced** with the cross-encoder score
        (sigmoid-normalised to 0-1).
        """
        if not results:
            return []

        pairs: list[list[str]] = [[query, r.chunk_content] for r in results]
        raw_scores: np.ndarray = self.model.predict(pairs, show_progress_bar=False)

        # Sigmoid normalisation so scores are in [0, 1]
        normalised = 1.0 / (1.0 + np.exp(-raw_scores))

        scored = sorted(
            zip(results, normalised.tolist()),
            key=lambda pair: pair[1],
            reverse=True,
        )

        reranked: list[SearchResult] = []
        for result, score in scored[:top_k]:
            reranked.append(
                result.model_copy(update={"score": round(float(score), 4)})
            )

        logger.info(
            "Reranked %d -> %d results (top score=%.4f)",
            len(results),
            len(reranked),
            reranked[0].score if reranked else 0.0,
        )
        return reranked

    async def mmr_select(
        self,
        query_embedding: list[float],
        results: list[SearchResult],
        result_embeddings: Sequence[list[float]],
        lambda_param: float = 0.5,
        top_k: int = 10,
    ) -> list[SearchResult]:
        """Maximal Marginal Relevance selection for diversity.

        ``lambda_param``: 1.0 = pure relevance, 0.0 = pure diversity.

        ``result_embeddings`` must correspond 1:1 with *results*.
        """
        if not results:
            return []

        q_vec = np.array(query_embedding, dtype=np.float32)
        doc_vecs = np.array(result_embeddings, dtype=np.float32)

        # Pre-compute cosine similarities to query
        sim_to_query = self._cosine_similarity_vec(q_vec, doc_vecs)

        selected_indices: list[int] = []
        remaining = set(range(len(results)))

        for _ in range(min(top_k, len(results))):
            best_idx = -1
            best_score = -float("inf")

            for idx in remaining:
                relevance = float(sim_to_query[idx])

                # Max similarity to already-selected documents
                if selected_indices:
                    selected_vecs = doc_vecs[selected_indices]
                    sims_to_selected = self._cosine_similarity_vec(doc_vecs[idx], selected_vecs)
                    max_sim_selected = float(np.max(sims_to_selected))
                else:
                    max_sim_selected = 0.0

                mmr_score = lambda_param * relevance - (1.0 - lambda_param) * max_sim_selected

                if mmr_score > best_score:
                    best_score = mmr_score
                    best_idx = idx

            if best_idx == -1:
                break

            selected_indices.append(best_idx)
            remaining.discard(best_idx)

        selected = [results[i] for i in selected_indices]
        logger.info("MMR selected %d diverse results from %d candidates", len(selected), len(results))
        return selected

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _cosine_similarity_vec(vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
        """Cosine similarity between a single vector and each row of a matrix."""
        vec_norm = vec / (np.linalg.norm(vec) + 1e-10)
        matrix_norms = matrix / (np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-10)
        return matrix_norms @ vec_norm

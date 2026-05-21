from typing import Literal

from pydantic import BaseModel, Field


class CompletionRequest(BaseModel):
    """Request body for LLM completion."""

    messages: list[dict]
    model: str
    temperature: float = 0.7
    max_tokens: int = 4096
    top_p: float = 1.0
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0
    stop: list[str] | None = None
    user_id: str | None = None
    stream: bool = False


class CompletionResponse(BaseModel):
    """Response body for LLM completion."""

    content: str
    model: str
    tokens: dict = Field(default_factory=lambda: {"prompt": 0, "completion": 0})
    finish_reason: str = "stop"
    cached: bool = False


class StreamChunk(BaseModel):
    """A single chunk in a streaming response."""

    type: Literal["content", "done", "error"]
    content: str | None = None
    finish_reason: str | None = None
    tokens: dict | None = None


class ModelInfo(BaseModel):
    """Information about an available model."""

    id: str
    provider: str
    max_context: int
    supports_vision: bool
    supports_streaming: bool


class EmbeddingRequest(BaseModel):
    """Request body for text embeddings."""

    texts: list[str]
    model: str = "text-embedding-3-small"


class EmbeddingResponse(BaseModel):
    """Response body for text embeddings."""

    embeddings: list[list[float]]
    model: str
    usage: dict = Field(default_factory=dict)

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """RAG Service configuration loaded from environment variables."""

    # PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://kyra:kyra@localhost:5432/kyra_guardrail"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Milvus
    MILVUS_HOST: str = "localhost"
    MILVUS_PORT: int = 19530

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_SECURE: bool = False

    # Embedding
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # Chunking
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 50

    # LLM Service (for query enhancement)
    LLM_SERVICE_URL: str = "http://localhost:8010"
    LLM_MODEL: str = "default"

    # Service
    SERVICE_NAME: str = "rag-service"
    SERVICE_PORT: int = 8001
    LOG_LEVEL: str = "INFO"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

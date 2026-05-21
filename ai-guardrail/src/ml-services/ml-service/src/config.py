from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """ML Service configuration loaded from environment variables."""

    REDIS_URL: str = "redis://localhost:6379/0"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_ENDPOINT: str = ""
    DEFAULT_MODEL: str = "gpt-4o"
    CACHE_TTL: int = 3600

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

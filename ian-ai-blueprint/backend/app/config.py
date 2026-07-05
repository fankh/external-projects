from pydantic_settings import BaseSettings, SettingsConfigDict

from app.model_catalog import DEFAULT_MODEL_ID


class ApplicationSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    anthropic_model_id: str = DEFAULT_MODEL_ID
    oda_file_converter_path: str = ""
    max_upload_size_bytes: int = 50 * 1024 * 1024


settings = ApplicationSettings()

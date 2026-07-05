from pydantic_settings import BaseSettings, SettingsConfigDict


class ApplicationSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    anthropic_model_id: str = "claude-sonnet-5"
    oda_file_converter_path: str = ""
    max_upload_size_bytes: int = 50 * 1024 * 1024


settings = ApplicationSettings()

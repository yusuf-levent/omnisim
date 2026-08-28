from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    LLM_MODEL: str = "qwen/qwen3.8-27b"
    GROQ_API_KEY: str | None = None
    DATABASE_URL: str = "sqlite:///./omnisim.db"
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
        )

settings = Settings()


def get_database_url() -> str:
    if settings.DATABASE_URL.startswith("postgres://"):
        return settings.DATABASE_URL.replace("postgres://", "postgresql://", 1)
    return settings.DATABASE_URL

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    LLM_MODEL: str = "qwen/qwen3.8-27b"
    GROQ_API_KEY: str | None = None
    DATABASE_URL: str = "sqlite:///./omnisim.db"
    FRONTEND_ORIGINS: str = "https://omni.weetis.com,http://localhost:5500,http://127.0.0.1:5500"
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
        )

settings = Settings()


def get_database_url() -> str:
    if settings.DATABASE_URL.startswith("postgres://"):
        return settings.DATABASE_URL.replace("postgres://", "postgresql://", 1)
    return settings.DATABASE_URL


def get_frontend_origins() -> list[str]:
    return [
        origin.strip().rstrip("/")
        for origin in settings.FRONTEND_ORIGINS.split(",")
        if origin.strip()
    ]

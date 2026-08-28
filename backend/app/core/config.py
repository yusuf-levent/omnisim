from pydantic_settings import BaseSettings,SettingsConfigDict


class Settings(BaseSettings):
    LLM_MODEL: str = "qwen/qwen3.8-27b"
    GROQ_API_KEY: str | None = None
    model_config = SettingsConfigDict(
            env_file=".env", env_file_encoding="utf-8", extra="ignore"
        )

settings=Settings()

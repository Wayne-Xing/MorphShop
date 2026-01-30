"""Application configuration management."""
from functools import lru_cache
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "MorphShop"
    debug: bool = False
    api_prefix: str = "/api"

    # Database
    database_url: str = "postgresql+asyncpg://morphshop:morphshop@localhost:5432/morphshop"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT Authentication
    jwt_secret_key: str = "your-super-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # RunningHub API
    runninghub_api_key: str = ""
    runninghub_base_url: str = "https://www.runninghub.cn"
    runninghub_try_on_app_id: str = ""
    runninghub_background_app_id: str = ""
    runninghub_video_app_id: str = ""

    # File Storage
    upload_dir: str = "./uploads"
    max_upload_size: int = 10485760  # 10MB
    allowed_image_types: str = "image/jpeg,image/png,image/webp"

    # Rate Limiting
    rate_limit_per_minute: int = 10

    # Usage Limits
    daily_user_limit_money: float = 10.0
    daily_user_limit_tasks: int = 50
    global_balance_warning: float = 100.0
    max_task_timeout: int = 300  # seconds

    # CORS - comma-separated list
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins as list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_image_types_list(self) -> list[str]:
        """Parse allowed image types as list."""
        return [t.strip() for t in self.allowed_image_types.split(",") if t.strip()]


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

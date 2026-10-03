from pathlib import Path
from pydantic import ConfigDict
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Gide API"
    ENVIRONMENT: str = "development"
    
    # Database (Native Windows PostgreSQL 18)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:sriram%40123@127.0.0.1:5432/gide"
    SYNC_DATABASE_URL: str = "postgresql://postgres:sriram%40123@127.0.0.1:5432/gide"
    
    # Redis & Arq (Redis 8.0)
    REDIS_HOST: str = "127.0.0.1"
    REDIS_PORT: int = 6379
    REDIS_URL: str = "redis://127.0.0.1:6379"
    
    # Storage
    STORAGE_DIR: str = str(Path("d:/gide/storage").resolve())
    
    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    model_config = ConfigDict(env_file=".env", extra="allow")

settings = Settings()

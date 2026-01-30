"""Database connection and session management."""
from collections.abc import AsyncGenerator
from pathlib import Path
import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

# Create async engine
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get database session."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize / migrate the database schema.

    We prefer Alembic migrations (supports upgrades on existing DBs). If Alembic
    isn't available for some reason, we fall back to `create_all()` which only
    works for a brand new database.
    """

    def _run_alembic_upgrade() -> None:
        from alembic import command
        from alembic.config import Config

        project_root = Path(__file__).resolve().parent.parent  # backend/
        alembic_ini = project_root / "alembic.ini"
        cfg = Config(str(alembic_ini))
        # Ensure Alembic uses the same URL as the running app (DATABASE_URL etc).
        cfg.set_main_option("sqlalchemy.url", settings.database_url)
        command.upgrade(cfg, "head")

    try:
        # Run Alembic in a thread to avoid `asyncio.run()` conflicts inside the
        # FastAPI event loop (Alembic env.py uses asyncio.run for async engines).
        await asyncio.to_thread(_run_alembic_upgrade)
    except Exception:
        # Last-resort fallback for brand new DBs if migrations cannot run.
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

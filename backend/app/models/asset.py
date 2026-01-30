"""Asset database model."""
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class AssetType(str, Enum):
    """Asset type enumeration."""
    MODEL_IMAGE = "model_image"
    CLOTHING_IMAGE = "clothing_image"
    BACKGROUND_IMAGE = "background_image"
    REFERENCE_VIDEO = "reference_video"
    TRY_ON_RESULT = "try_on_result"
    BACKGROUND_RESULT = "background_result"
    VIDEO_RESULT = "video_result"


class Asset(Base):
    """Asset model for file storage."""

    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # Human-friendly name used in UI and for download naming.
    # For uploads this can be empty; for generated results we set this to
    # "<project>_<workflow>_<YYYYMMDD_HHMMSS>.<ext>".
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    # SHA-256 of uploaded file bytes (hex). Used to dedupe "recent assets" in UI.
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    asset_type: Mapped[AssetType] = mapped_column(SQLEnum(AssetType), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="assets")

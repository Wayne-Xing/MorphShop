"""Project database model."""
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.task import Task
    from app.models.asset import Asset


class ProjectStatus(str, Enum):
    """Project status enumeration."""
    DRAFT = "draft"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Project(Base):
    """Project model for organizing workflow."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[ProjectStatus] = mapped_column(
        SQLEnum(ProjectStatus),
        default=ProjectStatus.DRAFT
    )

    # Workflow toggles (fully decoupled modules)
    enable_try_on: Mapped[bool] = mapped_column(default=True)
    enable_background: Mapped[bool] = mapped_column(default=True)
    enable_video: Mapped[bool] = mapped_column(default=True)

    # Workflow order (JSON text list: ["try_on","background","video"])
    workflow_steps: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Per-step input sources
    # background_person_source:
    # - "try_on_result": use try-on output image as the person image for background step
    # - "model_image": use the project's model_image as the person image for background step
    background_person_source: Mapped[str] = mapped_column(String(30), default="try_on_result")
    # try_on_person_source / video_person_source:
    # - "upstream": use upstream result if available
    # - "model_image": use the project's model_image as the person image
    try_on_person_source: Mapped[str | None] = mapped_column(String(30), nullable=True)
    video_person_source: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # Asset references
    model_image_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("assets.id", ondelete="SET NULL"),
        nullable=True
    )
    clothing_image_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("assets.id", ondelete="SET NULL"),
        nullable=True
    )
    background_image_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("assets.id", ondelete="SET NULL"),
        nullable=True,
    )
    reference_video_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("assets.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Video motion transfer parameters
    video_skip_seconds: Mapped[int] = mapped_column(Integer, default=0)
    video_duration: Mapped[int] = mapped_column(Integer, default=10)
    video_fps: Mapped[int] = mapped_column(Integer, default=30)
    video_width: Mapped[int] = mapped_column(Integer, default=720)
    video_height: Mapped[int] = mapped_column(Integer, default=1280)

    # Result references
    try_on_result_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("assets.id", ondelete="SET NULL"),
        nullable=True
    )
    background_result_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("assets.id", ondelete="SET NULL"),
        nullable=True
    )
    video_result_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("assets.id", ondelete="SET NULL"),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="projects")
    tasks: Mapped[list["Task"]] = relationship(
        "Task",
        back_populates="project",
        cascade="all, delete-orphan"
    )

    model_image: Mapped["Asset | None"] = relationship(
        "Asset",
        foreign_keys=[model_image_id]
    )
    clothing_image: Mapped["Asset | None"] = relationship(
        "Asset",
        foreign_keys=[clothing_image_id]
    )
    background_image: Mapped["Asset | None"] = relationship(
        "Asset",
        foreign_keys=[background_image_id],
    )
    reference_video: Mapped["Asset | None"] = relationship(
        "Asset",
        foreign_keys=[reference_video_id],
    )
    try_on_result: Mapped["Asset | None"] = relationship(
        "Asset",
        foreign_keys=[try_on_result_id]
    )
    background_result: Mapped["Asset | None"] = relationship(
        "Asset",
        foreign_keys=[background_result_id]
    )
    video_result: Mapped["Asset | None"] = relationship(
        "Asset",
        foreign_keys=[video_result_id]
    )

    # Pipeline runtime state (for sequential execution).
    pipeline_active: Mapped[bool] = mapped_column(default=False)
    pipeline_cancel_requested: Mapped[bool] = mapped_column(default=False)
    pipeline_chain: Mapped[bool] = mapped_column(default=True)
    pipeline_start_step: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pipeline_current_step: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pipeline_last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    pipeline_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pipeline_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

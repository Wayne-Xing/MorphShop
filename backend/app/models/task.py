"""Task database model."""
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Enum as SQLEnum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.project import Project


class TaskType(str, Enum):
    """Task type enumeration."""
    TRY_ON = "try_on"
    BACKGROUND = "background"
    VIDEO = "video"


class TaskStatus(str, Enum):
    """Task status enumeration."""
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class Task(Base):
    """Task model for tracking AI processing jobs."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    task_type: Mapped[TaskType] = mapped_column(SQLEnum(TaskType), nullable=False)
    status: Mapped[TaskStatus] = mapped_column(
        SQLEnum(TaskStatus),
        default=TaskStatus.PENDING
    )

    # RunningHub tracking
    runninghub_task_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    runninghub_client_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Input/Output
    input_params: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    result_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Progress
    progress_percent: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # RunningHub Usage / Cost tracking
    cost_time: Mapped[int | None] = mapped_column(Integer, nullable=True)  # seconds
    consume_money: Mapped[float | None] = mapped_column(Float, nullable=True)
    consume_coins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    third_party_cost: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="tasks")

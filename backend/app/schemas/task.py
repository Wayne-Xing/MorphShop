"""Task schemas for request/response validation."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.task import TaskStatus, TaskType


class TaskCreate(BaseModel):
    """Base schema for creating a task."""
    project_id: int


class TryOnTaskCreate(TaskCreate):
    """Schema for creating a try-on task."""
    model_image_id: int
    clothing_image_id: int


class BackgroundTaskCreate(TaskCreate):
    """Schema for creating a background change task."""
    source_image_id: int  # Usually the try-on result
    background_image_id: int | None = None
    background_prompt: str | None = Field(None, max_length=500)


class VideoTaskCreate(TaskCreate):
    """Schema for creating a video generation task."""
    source_image_id: int  # Usually the background result
    motion_type: str = Field(default="default", max_length=50)
    duration: int = Field(default=3, ge=1, le=10)  # seconds


class TaskResponse(BaseModel):
    """Schema for task response."""
    id: int
    project_id: int
    task_type: TaskType
    status: TaskStatus

    runninghub_task_id: str | None
    input_params: dict[str, Any] | None
    result_url: str | None
    thumbnail_url: str | None

    progress_percent: int
    error_message: str | None

    cost_time: int | None
    consume_money: float | None
    consume_coins: int | None

    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class TaskStatusResponse(BaseModel):
    """Schema for task status polling response."""
    id: int
    status: TaskStatus
    progress_percent: int
    result_url: str | None
    thumbnail_url: str | None
    error_message: str | None
    estimated_time: int | None = None  # Estimated remaining seconds

    model_config = {"from_attributes": True}

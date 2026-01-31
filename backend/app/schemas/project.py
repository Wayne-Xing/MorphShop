"""Project schemas for request/response validation."""
from datetime import datetime
import json

from pydantic import BaseModel, Field, field_validator

from app.models.project import ProjectStatus


class ProjectCreate(BaseModel):
    """Schema for creating a project."""
    name: str = Field(..., min_length=1, max_length=200)
    enable_try_on: bool = True
    enable_background: bool = True
    enable_video: bool = True
    workflow_steps: list[str] | None = None
    background_person_source: str | None = None
    try_on_person_source: str | None = None
    video_person_source: str | None = None
    video_skip_seconds: int | None = None
    video_duration: int | None = None
    video_fps: int | None = None
    video_width: int | None = None
    video_height: int | None = None


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    name: str | None = Field(None, min_length=1, max_length=200)
    enable_try_on: bool | None = None
    enable_background: bool | None = None
    enable_video: bool | None = None
    workflow_steps: list[str] | None = None
    background_person_source: str | None = None
    try_on_person_source: str | None = None
    video_person_source: str | None = None
    model_image_id: int | None = None
    clothing_image_id: int | None = None
    background_image_id: int | None = None
    reference_video_id: int | None = None
    video_skip_seconds: int | None = None
    video_duration: int | None = None
    video_fps: int | None = None
    video_width: int | None = None
    video_height: int | None = None


class AssetBrief(BaseModel):
    """Brief asset information for project response."""
    id: int
    file_url: str
    original_filename: str
    display_name: str | None = None

    model_config = {"from_attributes": True}


class ProjectResponse(BaseModel):
    """Schema for project response."""
    id: int
    name: str
    status: ProjectStatus
    enable_try_on: bool
    enable_background: bool
    enable_video: bool
    workflow_steps: list[str] | None = None
    background_person_source: str | None = None
    try_on_person_source: str | None = None
    video_person_source: str | None = None
    video_skip_seconds: int | None = None
    video_duration: int | None = None
    video_fps: int | None = None
    video_width: int | None = None
    video_height: int | None = None

    model_image: AssetBrief | None = None
    clothing_image: AssetBrief | None = None
    background_image: AssetBrief | None = None
    reference_video: AssetBrief | None = None
    try_on_result: AssetBrief | None = None
    background_result: AssetBrief | None = None
    video_result: AssetBrief | None = None

    # Pipeline runtime state (for sequential execution)
    pipeline_active: bool
    pipeline_cancel_requested: bool
    pipeline_chain: bool
    pipeline_start_step: str | None = None
    pipeline_current_step: str | None = None
    pipeline_last_error: str | None = None
    pipeline_started_at: datetime | None = None
    pipeline_updated_at: datetime | None = None

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("workflow_steps", mode="before")
    @classmethod
    def _parse_workflow_steps(cls, v):
        if v is None:
            return None
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return None
            try:
                parsed = json.loads(s)
                return parsed if isinstance(parsed, list) else None
            except Exception:
                return None
        return None


class ProjectListResponse(BaseModel):
    """Schema for project list response."""
    projects: list[ProjectResponse]
    total: int
    page: int
    page_size: int

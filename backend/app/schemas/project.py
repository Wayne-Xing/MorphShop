"""Project schemas for request/response validation."""
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.project import ProjectStatus


class ProjectCreate(BaseModel):
    """Schema for creating a project."""
    name: str = Field(..., min_length=1, max_length=200)


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    name: str | None = Field(None, min_length=1, max_length=200)
    model_image_id: int | None = None
    clothing_image_id: int | None = None


class AssetBrief(BaseModel):
    """Brief asset information for project response."""
    id: int
    file_url: str
    original_filename: str

    model_config = {"from_attributes": True}


class ProjectResponse(BaseModel):
    """Schema for project response."""
    id: int
    name: str
    status: ProjectStatus

    model_image: AssetBrief | None = None
    clothing_image: AssetBrief | None = None
    try_on_result: AssetBrief | None = None
    background_result: AssetBrief | None = None
    video_result: AssetBrief | None = None

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    """Schema for project list response."""
    projects: list[ProjectResponse]
    total: int
    page: int
    page_size: int

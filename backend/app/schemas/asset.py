"""Asset schemas for request/response validation."""
from datetime import datetime

from pydantic import BaseModel

from app.models.asset import AssetType


class AssetResponse(BaseModel):
    """Schema for asset response."""
    id: int
    filename: str
    display_name: str | None = None
    original_filename: str
    file_url: str
    content_hash: str | None = None
    asset_type: AssetType
    mime_type: str
    file_size: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AssetUploadResponse(BaseModel):
    """Schema for upload response."""
    id: int
    file_url: str
    content_hash: str | None = None
    original_filename: str
    asset_type: AssetType
    display_name: str | None = None

    model_config = {"from_attributes": True}

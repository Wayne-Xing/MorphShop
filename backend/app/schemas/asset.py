"""Asset schemas for request/response validation."""
from datetime import datetime

from pydantic import BaseModel

from app.models.asset import AssetType


class AssetResponse(BaseModel):
    """Schema for asset response."""
    id: int
    filename: str
    original_filename: str
    file_url: str
    asset_type: AssetType
    mime_type: str
    file_size: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AssetUploadResponse(BaseModel):
    """Schema for upload response."""
    id: int
    file_url: str
    original_filename: str
    asset_type: AssetType

    model_config = {"from_attributes": True}

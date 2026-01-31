"""File upload API routes."""
import hashlib

from fastapi import APIRouter, HTTPException, status, UploadFile, File, Form, Request

from app.api.deps import DbSession, CurrentUser
from app.config import get_settings
from app.models.asset import Asset, AssetType
from app.schemas.asset import AssetResponse, AssetUploadResponse
from app.utils.storage import storage
from app.utils.rate_limiter import limiter

settings = get_settings()
router = APIRouter()


def validate_image(file: UploadFile) -> None:
    """Validate uploaded image file."""
    if file.content_type not in settings.allowed_image_types_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(settings.allowed_image_types_list)}",
        )


def validate_video(file: UploadFile) -> None:
    """Validate uploaded video file."""
    if file.content_type in settings.allowed_video_types_list:
        return

    # Some browsers send "application/octet-stream" for MP4 files.
    if file.content_type == "application/octet-stream":
        return

    filename = (file.filename or "").lower()
    if filename.endswith(".mp4"):
        return

    if file.content_type and file.content_type.startswith("video/"):
        return

    if file.content_type not in settings.allowed_video_types_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(settings.allowed_video_types_list)}",
        )


@router.post("/image", response_model=AssetUploadResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def upload_image(
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
    asset_type: AssetType = Form(...),
):
    """Upload an image file."""
    # Validate file type
    validate_image(file)

    # Read file content
    content = await file.read()
    content_hash = hashlib.sha256(content).hexdigest()

    # Check file size
    if len(content) > settings.max_upload_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {settings.max_upload_size // 1024 // 1024}MB",
        )

    # Save file
    relative_path, filename = await storage.save_file(
        content=content,
        original_filename=file.filename or "image.jpg",
        subfolder="images",
    )

    # Create asset record
    asset = Asset(
        user_id=current_user.id,
        filename=filename,
        original_filename=file.filename or "image.jpg",
        file_path=relative_path,
        file_url=storage.get_file_url(relative_path),
        content_hash=content_hash,
        asset_type=asset_type,
        mime_type=file.content_type or "image/jpeg",
        file_size=len(content),
    )
    db.add(asset)
    await db.flush()
    await db.refresh(asset)

    return AssetUploadResponse(
        id=asset.id,
        file_url=asset.file_url,
        content_hash=asset.content_hash,
        original_filename=asset.original_filename,
        asset_type=asset.asset_type,
        display_name=asset.display_name,
    )


@router.post("/video", response_model=AssetUploadResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def upload_video(
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
    asset_type: AssetType = Form(...),
):
    """Upload a reference video file."""
    if asset_type != AssetType.REFERENCE_VIDEO:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid asset_type for video upload",
        )

    # Validate file type
    validate_video(file)

    # Read file content
    content = await file.read()
    content_hash = hashlib.sha256(content).hexdigest()

    # Check file size
    if len(content) > settings.max_video_upload_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {settings.max_video_upload_size // 1024 // 1024}MB",
        )

    # Save file
    relative_path, filename = await storage.save_file(
        content=content,
        original_filename=file.filename or "video.mp4",
        subfolder="videos",
    )

    # Create asset record
    asset = Asset(
        user_id=current_user.id,
        filename=filename,
        original_filename=file.filename or "video.mp4",
        file_path=relative_path,
        file_url=storage.get_file_url(relative_path),
        content_hash=content_hash,
        asset_type=asset_type,
        mime_type=file.content_type or "video/mp4",
        file_size=len(content),
    )
    db.add(asset)
    await db.flush()
    await db.refresh(asset)

    return AssetUploadResponse(
        id=asset.id,
        file_url=asset.file_url,
        content_hash=asset.content_hash,
        original_filename=asset.original_filename,
        asset_type=asset.asset_type,
        display_name=asset.display_name,
    )


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: int,
    current_user: CurrentUser,
    db: DbSession,
):
    """Get asset details."""
    from sqlalchemy import select

    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == current_user.id)
    )
    asset = result.scalar_one_or_none()

    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )

    return asset


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: int,
    current_user: CurrentUser,
    db: DbSession,
):
    """Delete an asset."""
    from sqlalchemy import select

    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == current_user.id)
    )
    asset = result.scalar_one_or_none()

    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )

    # Delete local file from storage (result assets may be externally hosted).
    if not (asset.file_path.startswith("http://") or asset.file_path.startswith("https://")):
        await storage.delete_file(asset.file_path)

    # Delete database record
    await db.delete(asset)

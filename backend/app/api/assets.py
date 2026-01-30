"""Asset browsing and downloads."""

from datetime import datetime, timedelta, timezone
from typing import AsyncIterator
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models.asset import Asset, AssetType
from app.schemas.asset import AssetResponse
from app.utils.storage import storage

router = APIRouter()


def _is_external_url(value: str | None) -> bool:
    if not value:
        return False
    return value.startswith("http://") or value.startswith("https://")


def _content_disposition(filename: str, inline: bool) -> str:
    # RFC 5987 filename* supports UTF-8 (e.g. Chinese project names).
    quoted = quote(filename)
    disp = "inline" if inline else "attachment"
    return f"{disp}; filename*=UTF-8''{quoted}"


@router.get("", response_model=list[AssetResponse])
async def list_assets(
    current_user: CurrentUser,
    db: DbSession,
    asset_type: list[AssetType] | None = Query(None),
    days: int | None = Query(None, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List current user's assets (optionally filtered by type and recent days)."""
    stmt = select(Asset).where(Asset.user_id == current_user.id)

    if asset_type:
        stmt = stmt.where(Asset.asset_type.in_(asset_type))

    if days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        stmt = stmt.where(Asset.created_at >= cutoff)

    stmt = stmt.order_by(Asset.created_at.desc()).limit(limit).offset(offset)

    result = await db.execute(stmt)
    assets = result.scalars().all()

    return [AssetResponse.model_validate(a) for a in assets]


@router.get("/{asset_id}/download")
async def download_asset(
    asset_id: int,
    current_user: CurrentUser,
    db: DbSession,
    inline: bool = Query(False),
):
    """Download an asset with a controlled filename (Content-Disposition).

    For externally-hosted results (e.g. RunningHub CDN), this proxies the download
    so the browser receives the desired filename.
    """
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == current_user.id)
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    filename = asset.display_name or asset.original_filename or asset.filename
    headers = {
        "Content-Disposition": _content_disposition(filename, inline=inline),
    }

    # Local storage: file_path is a relative path like "images/YYYY/MM/DD/..."
    if not _is_external_url(asset.file_path) and not _is_external_url(asset.file_url):
        full_path = storage.get_absolute_path(asset.file_path)

        # Defense-in-depth: ensure the path is within upload_dir and exists.
        try:
            full_path.resolve().relative_to(storage.base_dir.resolve())
        except Exception:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        if not full_path.exists() or not full_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

        return FileResponse(
            full_path,
            media_type=asset.mime_type,
            filename=filename,
            headers=headers,
        )

    # External: proxy via backend to control filename.
    url = asset.file_url if _is_external_url(asset.file_url) else asset.file_path

    async def stream() -> AsyncIterator[bytes]:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=300.0)) as client:
            async with client.stream("GET", url) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes():
                    yield chunk

    return StreamingResponse(stream(), media_type=asset.mime_type, headers=headers)

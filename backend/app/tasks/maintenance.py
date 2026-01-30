"""Maintenance tasks (e.g. retention cleanup)."""

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.database import async_session_maker
from app.models.asset import Asset, AssetType
from app.tasks.celery_app import celery_app
from app.utils.storage import storage


def _run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _is_external(value: str | None) -> bool:
    return bool(value) and (value.startswith("http://") or value.startswith("https://"))


@celery_app.task
def cleanup_expired_results(days: int = 7) -> dict:
    """Delete generated workflow result assets older than `days`.

    Notes:
    - Only deletes result asset types (TRY_ON_RESULT/BACKGROUND_RESULT/VIDEO_RESULT).
    - Uploaded inputs (MODEL_IMAGE/CLOTHING_IMAGE/BACKGROUND_IMAGE) are not touched.
    - For externally-hosted assets, only the DB record is deleted.
    """
    return _run_async(_cleanup_expired_results_async(days))


async def _cleanup_expired_results_async(days: int) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result_types = (
        AssetType.TRY_ON_RESULT,
        AssetType.BACKGROUND_RESULT,
        AssetType.VIDEO_RESULT,
    )

    async with async_session_maker() as db:
        res = await db.execute(
            select(Asset.id, Asset.file_path)
            .where(Asset.asset_type.in_(result_types))
            .where(Asset.created_at < cutoff)
        )
        rows = res.all()
        asset_ids = [r[0] for r in rows]

        # Delete local files first (best effort).
        deleted_files = 0
        for _, file_path in rows:
            if file_path and not _is_external(file_path):
                ok = await storage.delete_file(file_path)
                if ok:
                    deleted_files += 1

        if asset_ids:
            await db.execute(delete(Asset).where(Asset.id.in_(asset_ids)))
            await db.commit()

        return {
            "cutoff": cutoff.isoformat(),
            "deleted_assets": len(asset_ids),
            "deleted_local_files": deleted_files,
        }


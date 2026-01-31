"""Task management API routes."""
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, status, Request, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession, CurrentUser
from app.models.asset import Asset, AssetType
from app.models.project import Project
from app.models.task import Task, TaskStatus
from app.schemas.task import (
    TaskResponse,
    TaskStatusResponse,
    TryOnTaskCreate,
    BackgroundTaskCreate,
    VideoTaskCreate,
)
from app.services.try_on import TryOnService
from app.services.background import BackgroundService
from app.services.video import VideoService
from app.services.usage_service import UsageService
from app.utils.rate_limiter import limiter

router = APIRouter()


def _is_external_url(value: str | None) -> bool:
    if not value:
        return False
    return value.startswith("http://") or value.startswith("https://")


def _safe_filename_component(value: str) -> str:
    # Keep Unicode (project names), but remove filesystem/path separator and control chars.
    bad = ['\\', '/', ':', '*', '?', '"', "<", ">", "|", "\r", "\n", "\t"]
    out = value.strip()
    for ch in bad:
        out = out.replace(ch, "_")
    out = " ".join(out.split())  # collapse whitespace
    return out[:120] if len(out) > 120 else out


def _guess_ext(result_url: str | None, task_type: str, outputs: list[dict] | None = None) -> str:
    if result_url:
        path = urlparse(result_url).path
        ext = Path(path).suffix
        if ext:
            return ext.lower()

    if outputs:
        first = outputs[0] if outputs else None
        if first:
            output_type = first.get("outputType") or first.get("output_type")
            if output_type and isinstance(output_type, str):
                if not output_type.startswith("."):
                    return f".{output_type.lower()}"
                return output_type.lower()

    return ".mp4" if task_type == "video" else ".png"


def _mime_from_ext(ext: str) -> str:
    ext = ext.lower().lstrip(".")
    return {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
        "mp4": "video/mp4",
    }.get(ext, "application/octet-stream")


async def verify_project_access(
    project_id: int,
    user_id: int,
    db,
) -> Project:
    """Verify user has access to project."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user_id
        )
    )
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


async def get_asset(asset_id: int, user_id: int, db) -> Asset:
    """Get asset and verify ownership."""
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == user_id)
    )
    asset = result.scalar_one_or_none()

    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Asset {asset_id} not found",
        )
    return asset


@router.post("/try-on", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_try_on_task(
    request: Request,
    task_data: TryOnTaskCreate,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """Create a virtual try-on task."""
    # Check user quota
    usage_service = UsageService(db)
    allowed, error = await usage_service.check_user_quota(current_user.id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error,
        )

    # Verify project access + workflow enabled
    project = await verify_project_access(task_data.project_id, current_user.id, db)
    if not project.enable_try_on:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Try-on workflow is disabled for this project")

    # Get assets
    model_image = await get_asset(task_data.model_image_id, current_user.id, db)
    clothing_image = await get_asset(task_data.clothing_image_id, current_user.id, db)

    # Create task
    try_on_service = TryOnService(db)
    task = await try_on_service.create_task(
        project_id=task_data.project_id,
        model_image=model_image,
        clothing_image=clothing_image,
    )

    # Submit to RunningHub in background
    # Note: In production, this would be handled by Celery
    background_tasks.add_task(
        submit_and_poll_task,
        task.id,
        "try_on",
    )

    return task


@router.post("/background", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_background_task(
    request: Request,
    task_data: BackgroundTaskCreate,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """Create a background change task."""
    usage_service = UsageService(db)
    allowed, error = await usage_service.check_user_quota(current_user.id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error,
        )

    project = await verify_project_access(task_data.project_id, current_user.id, db)
    if not project.enable_background:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Background workflow is disabled for this project")

    source_image = await get_asset(task_data.source_image_id, current_user.id, db)
    background_image = None
    if task_data.background_image_id:
        background_image = await get_asset(
            task_data.background_image_id,
            current_user.id,
            db
        )

    background_service = BackgroundService(db)
    task = await background_service.create_task(
        project_id=task_data.project_id,
        source_image=source_image,
        background_image=background_image,
        background_prompt=task_data.background_prompt,
    )

    background_tasks.add_task(
        submit_and_poll_task,
        task.id,
        "background",
    )

    return task


@router.post("/video", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def create_video_task(
    request: Request,
    task_data: VideoTaskCreate,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """Create a video motion transfer task."""
    usage_service = UsageService(db)
    allowed, error = await usage_service.check_user_quota(current_user.id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error,
        )

    project = await verify_project_access(task_data.project_id, current_user.id, db)
    if not project.enable_video:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Video workflow is disabled for this project")

    person_image = await get_asset(task_data.person_image_id, current_user.id, db)
    reference_video = await get_asset(task_data.reference_video_id, current_user.id, db)
    if reference_video.asset_type != AssetType.REFERENCE_VIDEO:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reference_video_id must be a reference_video asset",
        )

    video_service = VideoService(db)
    task = await video_service.create_task(
        project_id=task_data.project_id,
        person_image=person_image,
        reference_video=reference_video,
        skip_seconds=task_data.skip_seconds,
        duration=task_data.duration,
        fps=task_data.fps,
        width=task_data.width,
        height=task_data.height,
    )

    background_tasks.add_task(
        submit_and_poll_task,
        task.id,
        "video",
    )

    return task


@router.get("/project/{project_id}", response_model=list[TaskResponse])
async def get_project_tasks(
    project_id: int,
    current_user: CurrentUser,
    db: DbSession,
):
    """Get all tasks for a project."""
    # Verify project access
    await verify_project_access(project_id, current_user.id, db)

    result = await db.execute(
        select(Task)
        .where(Task.project_id == project_id)
        .order_by(Task.created_at.desc())
    )
    tasks = result.scalars().all()

    return tasks


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    current_user: CurrentUser,
    db: DbSession,
):
    """Get task details."""
    result = await db.execute(
        select(Task)
        .join(Project)
        .where(Task.id == task_id, Project.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    return task


@router.get("/{task_id}/status", response_model=TaskStatusResponse)
async def get_task_status(
    task_id: int,
    current_user: CurrentUser,
    db: DbSession,
):
    """Get task status for polling."""
    result = await db.execute(
        select(Task)
        .join(Project)
        .where(Task.id == task_id, Project.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Estimate remaining time based on task type and progress
    estimated_time = None
    if task.status == TaskStatus.RUNNING:
        if task.progress_percent > 0:
            # Estimate based on current progress
            elapsed = 30  # Assume average 30 seconds so far
            estimated_time = int((100 - task.progress_percent) * elapsed / task.progress_percent)
        else:
            estimated_time = 60  # Default estimate

    return TaskStatusResponse(
        id=task.id,
        status=task.status,
        progress_percent=task.progress_percent,
        result_url=task.result_url,
        thumbnail_url=task.thumbnail_url,
        error_message=task.error_message,
        estimated_time=estimated_time,
    )


async def submit_and_poll_task(task_id: int, task_type: str):
    """
    Background function to submit task and poll for completion.
    Runs as FastAPI BackgroundTask.
    """
    from datetime import datetime, timezone
    from app.database import async_session_maker
    from app.services.runninghub import RunningHubClient, get_app_config
    from app.config import get_settings
    from app.utils.storage import storage
    import httpx

    async with async_session_maker() as db:
        # Get task from database
        result = await db.execute(
            select(Task).where(Task.id == task_id)
        )
        task = result.scalar_one_or_none()

        if task is None:
            return

        if task.status != TaskStatus.PENDING:
            return

        client = RunningHubClient()
        app_config = get_app_config(task_type)
        settings = get_settings()

        try:
            # Update status to QUEUED
            task.status = TaskStatus.QUEUED
            task.started_at = datetime.now(timezone.utc)
            await db.commit()

            # Upload images to RunningHub and build params
            params = {}

            async def load_asset_bytes(asset: Asset) -> bytes:
                """Load asset bytes from local storage or an external URL."""
                # External results are stored as URLs; download then re-upload to RunningHub.
                if _is_external_url(asset.file_path) or _is_external_url(asset.file_url):
                    url = asset.file_url if _is_external_url(asset.file_url) else asset.file_path
                    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=300.0)) as http:
                        resp = await http.get(url)
                        resp.raise_for_status()
                        return resp.content

                local_path = storage.get_absolute_path(asset.file_path)
                with open(local_path, "rb") as f:
                    return f.read()

            if task_type == "try_on":
                # Get assets to read files
                model_asset = await db.execute(
                    select(Asset).where(Asset.id == task.input_params.get("model_image_id"))
                )
                model_asset = model_asset.scalar_one_or_none()
                clothing_asset = await db.execute(
                    select(Asset).where(Asset.id == task.input_params.get("clothing_image_id"))
                )
                clothing_asset = clothing_asset.scalar_one_or_none()

                if not model_asset or not clothing_asset:
                    task.status = TaskStatus.FAILED
                    task.error_message = "Asset not found"
                    task.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return

                # Read (local or external) and upload images to RunningHub
                model_data = await load_asset_bytes(model_asset)
                clothing_data = await load_asset_bytes(clothing_asset)

                model_rh_name = await client.upload_image(model_data, model_asset.filename)
                clothing_rh_name = await client.upload_image(clothing_data, clothing_asset.filename)

                if not model_rh_name or not clothing_rh_name:
                    task.status = TaskStatus.FAILED
                    task.error_message = "Failed to upload images to RunningHub"
                    task.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return

                params = {
                    "model_image": model_rh_name,
                    "clothing_image": clothing_rh_name,
                }

            elif task_type == "background":
                source_asset = await db.execute(
                    select(Asset).where(Asset.id == task.input_params.get("source_image_id"))
                )
                source_asset = source_asset.scalar_one_or_none()
                bg_asset = await db.execute(
                    select(Asset).where(Asset.id == task.input_params.get("background_image_id"))
                )
                bg_asset = bg_asset.scalar_one_or_none()

                if not source_asset:
                    task.status = TaskStatus.FAILED
                    task.error_message = "Source asset not found"
                    task.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return

                source_data = await load_asset_bytes(source_asset)
                source_rh_name = await client.upload_image(source_data, source_asset.filename)

                bg_rh_name = None
                if bg_asset:
                    bg_data = await load_asset_bytes(bg_asset)
                    bg_rh_name = await client.upload_image(bg_data, bg_asset.filename)

                if not source_rh_name:
                    task.status = TaskStatus.FAILED
                    task.error_message = "Failed to upload images to RunningHub"
                    task.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return

                params = {
                    "source_image": source_rh_name,
                    "background_image": bg_rh_name,
                }

            elif task_type == "video":
                person_asset = await db.execute(
                    select(Asset).where(Asset.id == task.input_params.get("person_image_id"))
                )
                person_asset = person_asset.scalar_one_or_none()
                ref_asset = await db.execute(
                    select(Asset).where(Asset.id == task.input_params.get("reference_video_id"))
                )
                ref_asset = ref_asset.scalar_one_or_none()

                if not person_asset or not ref_asset:
                    task.status = TaskStatus.FAILED
                    task.error_message = "Required asset not found"
                    task.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return

                person_data = await load_asset_bytes(person_asset)
                ref_data = await load_asset_bytes(ref_asset)

                person_rh_name = await client.upload_image(person_data, person_asset.filename)
                ref_rh_name = await client.upload_file(ref_data, ref_asset.filename)

                if not person_rh_name or not ref_rh_name:
                    task.status = TaskStatus.FAILED
                    task.error_message = "Failed to upload assets to RunningHub"
                    task.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return

                params = {
                    "person_image": person_rh_name,
                    "reference_video": ref_rh_name,
                    "skip_seconds": str(task.input_params.get("skip_seconds", 0)),
                    "duration": str(task.input_params.get("duration", 10)),
                    "fps": str(task.input_params.get("fps", 30)),
                    "width": str(task.input_params.get("width", 720)),
                    "height": str(task.input_params.get("height", 1280)),
                }

            # Submit to RunningHub
            response = await client.create_task(app_config, params)

            if not response.success:
                task.status = TaskStatus.FAILED
                task.error_message = response.error_message or "Task creation failed"
                task.completed_at = datetime.now(timezone.utc)
                await db.commit()
                return

            task.runninghub_task_id = response.task_id
            task.runninghub_client_id = response.client_id
            task.status = TaskStatus.RUNNING
            await db.commit()

            # Progress callback to update database
            async def update_progress(status_str: str, progress: int, elapsed: float):
                task.progress_percent = progress
                await db.commit()

            # Poll for completion with progress updates
            status_response = await client.wait_for_completion(
                response.task_id,
                timeout=settings.max_task_timeout,
                on_progress=update_progress,
            )

            # Update task with results
            if status_response.status == "SUCCESS":
                task.status = TaskStatus.SUCCESS
                task.result_url = status_response.result_url
                task.progress_percent = 100
                task.completed_at = datetime.now(timezone.utc)

                # Extract usage info
                if status_response.usage:
                    task.cost_time = status_response.usage.task_cost_time
                    task.consume_money = status_response.usage.consume_money
                    task.consume_coins = status_response.usage.consume_coins
                    task.third_party_cost = status_response.usage.third_party_consume_money

                # Create Asset and update Project with result
                if status_response.result_url:
                    from app.models.asset import AssetType

                    # Map task type to asset type
                    asset_type_map = {
                        "try_on": AssetType.TRY_ON_RESULT,
                        "background": AssetType.BACKGROUND_RESULT,
                        "video": AssetType.VIDEO_RESULT,
                    }

                    # Get project to find user_id
                    project_result = await db.execute(
                        select(Project).where(Project.id == task.project_id)
                    )
                    project = project_result.scalar_one_or_none()

                    if project:
                        # Use server *local* time for naming as requested.
                        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                        base = f"{_safe_filename_component(project.name)}_{task_type}_{ts}"
                        ext = _guess_ext(status_response.result_url, task_type, outputs=status_response.outputs)
                        display_name = f"{base}{ext}"

                        # Create new asset for the result
                        result_asset = Asset(
                            user_id=project.user_id,
                            filename=display_name,
                            display_name=display_name,
                            original_filename=display_name,
                            file_path=status_response.result_url,  # Store external URL
                            file_url=status_response.result_url,   # Use external URL directly
                            asset_type=asset_type_map.get(task_type, AssetType.TRY_ON_RESULT),
                            mime_type=_mime_from_ext(ext),
                            file_size=0,  # Unknown for external URL
                        )
                        db.add(result_asset)
                        await db.flush()

                        task.result_asset_id = result_asset.id

                        # Update project with result reference
                        if task_type == "try_on":
                            project.try_on_result_id = result_asset.id
                        elif task_type == "background":
                            project.background_result_id = result_asset.id
                        elif task_type == "video":
                            project.video_result_id = result_asset.id

            else:
                task.status = TaskStatus.FAILED
                task.error_message = status_response.error_message or "Task failed"
                task.completed_at = datetime.now(timezone.utc)

            await db.commit()

        except TimeoutError:
            task.status = TaskStatus.FAILED
            task.error_message = "Timeout failed (1h)"
            task.completed_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error_message = str(e)
            task.completed_at = datetime.now(timezone.utc)
            await db.commit()


@router.post("/webhook/runninghub")
async def runninghub_webhook(
    request: Request,
    db: DbSession,
):
    """Handle RunningHub webhook callbacks."""
    data = await request.json()

    task_id = data.get("taskId")
    if not task_id:
        return {"status": "ignored", "reason": "no task_id"}

    result = await db.execute(
        select(Task).where(Task.runninghub_task_id == task_id)
    )
    task = result.scalar_one_or_none()

    if task is None:
        return {"status": "ignored", "reason": "task not found"}

    # Update task based on webhook data
    status_str = data.get("status", "").upper()
    if status_str == "SUCCESS":
        task.status = TaskStatus.SUCCESS
        task.progress_percent = 100
        # Support both legacy and current payloads.
        outputs = data.get("outputs") or data.get("results") or []
        if outputs:
            task.result_url = outputs[0].get("fileUrl") or outputs[0].get("url") or task.result_url

        # If we don't have a result asset yet, create one for retention/history/download naming.
        if task.result_url and not task.result_asset_id:
            from app.models.asset import AssetType
            from sqlalchemy import select as _select

            project_result = await db.execute(_select(Project).where(Project.id == task.project_id))
            project = project_result.scalar_one_or_none()
            if project:
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                task_type_value = task.task_type.value
                base = f"{_safe_filename_component(project.name)}_{task_type_value}_{ts}"
                ext = _guess_ext(task.result_url, task_type_value, outputs=outputs)
                display_name = f"{base}{ext}"

                asset_type_map = {
                    "try_on": AssetType.TRY_ON_RESULT,
                    "background": AssetType.BACKGROUND_RESULT,
                    "video": AssetType.VIDEO_RESULT,
                }
                result_asset = Asset(
                    user_id=project.user_id,
                    filename=display_name,
                    display_name=display_name,
                    original_filename=display_name,
                    file_path=task.result_url,
                    file_url=task.result_url,
                    asset_type=asset_type_map.get(task_type_value, AssetType.TRY_ON_RESULT),
                    mime_type=_mime_from_ext(ext),
                    file_size=0,
                )
                db.add(result_asset)
                await db.flush()

                task.result_asset_id = result_asset.id
                if task_type_value == "try_on":
                    project.try_on_result_id = result_asset.id
                elif task_type_value == "background":
                    project.background_result_id = result_asset.id
                elif task_type_value == "video":
                    project.video_result_id = result_asset.id

        # Extract usage data
        if "usage" in data:
            usage = data["usage"]
            task.cost_time = usage.get("taskCostTime")
            task.consume_money = float(usage.get("consumeMoney", 0))
            task.consume_coins = usage.get("consumeCoins")
            task.third_party_cost = usage.get("thirdPartyConsumeMoney")

    elif status_str in ("FAILED", "ERROR"):
        task.status = TaskStatus.FAILED
        task.error_message = data.get("errorMsg", "Unknown error")

    await db.flush()
    return {"status": "ok"}

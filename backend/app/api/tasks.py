"""Task management API routes."""
from fastapi import APIRouter, HTTPException, status, Request, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession, CurrentUser
from app.models.asset import Asset
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

    # Verify project access
    await verify_project_access(task_data.project_id, current_user.id, db)

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

    await verify_project_access(task_data.project_id, current_user.id, db)

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
    """Create a video generation task."""
    usage_service = UsageService(db)
    allowed, error = await usage_service.check_user_quota(current_user.id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error,
        )

    await verify_project_access(task_data.project_id, current_user.id, db)

    source_image = await get_asset(task_data.source_image_id, current_user.id, db)

    video_service = VideoService(db)
    task = await video_service.create_task(
        project_id=task_data.project_id,
        source_image=source_image,
        motion_type=task_data.motion_type,
        duration=task_data.duration,
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
    from app.utils.storage import storage

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

        try:
            # Update status to QUEUED
            task.status = TaskStatus.QUEUED
            task.started_at = datetime.now(timezone.utc)
            await db.commit()

            # Upload images to RunningHub and build params
            params = {}
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

                # Read and upload images to RunningHub
                model_path = storage.get_absolute_path(model_asset.file_path)
                clothing_path = storage.get_absolute_path(clothing_asset.file_path)

                with open(model_path, "rb") as f:
                    model_data = f.read()
                with open(clothing_path, "rb") as f:
                    clothing_data = f.read()

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

                source_path = storage.get_absolute_path(source_asset.file_path)
                with open(source_path, "rb") as f:
                    source_data = f.read()
                source_rh_name = await client.upload_image(source_data, source_asset.filename)

                bg_rh_name = None
                if bg_asset:
                    bg_path = storage.get_absolute_path(bg_asset.file_path)
                    with open(bg_path, "rb") as f:
                        bg_data = f.read()
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
                source_asset = await db.execute(
                    select(Asset).where(Asset.id == task.input_params.get("source_image_id"))
                )
                source_asset = source_asset.scalar_one_or_none()

                if not source_asset:
                    task.status = TaskStatus.FAILED
                    task.error_message = "Source asset not found"
                    task.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return

                source_path = storage.get_absolute_path(source_asset.file_path)
                with open(source_path, "rb") as f:
                    source_data = f.read()
                source_rh_name = await client.upload_image(source_data, source_asset.filename)

                if not source_rh_name:
                    task.status = TaskStatus.FAILED
                    task.error_message = "Failed to upload image to RunningHub"
                    task.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return

                params = {
                    "source_image": source_rh_name,
                    "motion_type": task.input_params.get("motion_type", "default"),
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
                timeout=app_config.timeout,
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
                        # Create new asset for the result
                        result_asset = Asset(
                            user_id=project.user_id,
                            filename=f"result_{task.id}.png",
                            original_filename=f"result_{task_type}_{task.id}.png",
                            file_path=status_response.result_url,  # Store external URL
                            file_url=status_response.result_url,   # Use external URL directly
                            asset_type=asset_type_map.get(task_type, AssetType.TRY_ON_RESULT),
                            mime_type="image/png" if task_type != "video" else "video/mp4",
                            file_size=0,  # Unknown for external URL
                        )
                        db.add(result_asset)
                        await db.flush()

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
            task.error_message = "Task timed out"
            task.completed_at = datetime.now(timezone.utc)
            await db.commit()

            # Cancel the task on RunningHub
            if task.runninghub_task_id:
                try:
                    await client.cancel_task(task.runninghub_task_id)
                except Exception:
                    pass

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
        if "outputs" in data:
            outputs = data["outputs"]
            if outputs and "fileUrl" in outputs[0]:
                task.result_url = outputs[0]["fileUrl"]

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

"""Project management API routes."""
import json

from fastapi import APIRouter, HTTPException, status, Query, BackgroundTasks
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession, CurrentUser
from app.models.project import Project, ProjectStatus
from app.models.task import Task, TaskStatus, TaskType
from app.models.asset import Asset
from app.schemas.asset import AssetResponse
from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
)

router = APIRouter()

_BASE_STEP_ORDER = ["try_on", "background", "video"]
_STEP_OUTPUT_TYPE = {
    "try_on": "image",
    "background": "image",
    "video": "video",
}
_STEP_PERSON_INPUT_TYPE = {
    "try_on": "image",
    "background": "image",
    "video": "image",
}
_STEP_RESULT_ATTR = {
    "try_on": "try_on_result_id",
    "background": "background_result_id",
    "video": "video_result_id",
}


def _normalize_person_source(value: str | None) -> str | None:
    if value is None:
        return None
    v = value.strip().lower()
    if not v:
        return None
    if v in ("upstream", "model_image"):
        return v
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid person source mode.")


def _parse_steps(value: str | None) -> list[str] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(s) for s in parsed]
    except Exception:
        return None
    return None


def _default_steps_for_project(p: Project) -> list[str]:
    enabled = {
        "try_on": bool(p.enable_try_on),
        "background": bool(p.enable_background),
        "video": bool(p.enable_video),
    }
    return [s for s in _BASE_STEP_ORDER if enabled.get(s)]


def _steps_for_project(p: Project) -> list[str]:
    """Return the configured workflow order (filtered to enabled steps)."""
    configured = _parse_steps(getattr(p, "workflow_steps", None))
    if not configured:
        return _default_steps_for_project(p)

    enabled = {
        "try_on": bool(p.enable_try_on),
        "background": bool(p.enable_background),
        "video": bool(p.enable_video),
    }
    seen: set[str] = set()
    out: list[str] = []
    for s in configured:
        if s in enabled and enabled[s] and s not in seen:
            out.append(s)
            seen.add(s)

    # Ensure we don't "lose" newly enabled steps.
    for s in _BASE_STEP_ORDER:
        if enabled.get(s) and s not in seen:
            out.append(s)
            seen.add(s)
    return out


def _result_id_for_step(p: Project, step: str) -> int | None:
    attr = _STEP_RESULT_ATTR.get(step)
    if not attr:
        return None
    return getattr(p, attr, None)


def _find_upstream_result_id(p: Project, steps: list[str], step: str) -> int | None:
    input_type = _STEP_PERSON_INPUT_TYPE.get(step)
    if not input_type or step not in steps:
        return None
    idx = steps.index(step)
    for prev in reversed(steps[:idx]):
        if _STEP_OUTPUT_TYPE.get(prev) != input_type:
            continue
        result_id = _result_id_for_step(p, prev)
        if result_id:
            return result_id
    return None


def _has_upstream_step(steps: list[str], step: str) -> bool:
    input_type = _STEP_PERSON_INPUT_TYPE.get(step)
    if not input_type or step not in steps:
        return False
    idx = steps.index(step)
    for prev in reversed(steps[:idx]):
        if _STEP_OUTPUT_TYPE.get(prev) == input_type:
            return True
    return False


def _resolve_person_source_id(p: Project, steps: list[str], step: str) -> int | None:
    """Resolve the person image source for a step based on user preference."""
    upstream_id = _find_upstream_result_id(p, steps, step)
    has_upstream = _has_upstream_step(steps, step)

    if step == "background":
        raw = (getattr(p, "background_person_source", None) or "try_on_result").lower()
        mode = "model_image" if raw == "model_image" else "upstream"
    elif step == "try_on":
        mode = _normalize_person_source(getattr(p, "try_on_person_source", None) or None)
    elif step == "video":
        mode = _normalize_person_source(getattr(p, "video_person_source", None) or None)
    else:
        mode = None

    if mode == "model_image":
        return p.model_image_id
    if mode == "upstream":
        return upstream_id if has_upstream else p.model_image_id

    # Auto (unset): prefer upstream when available, else fallback to model image.
    return upstream_id or p.model_image_id


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List all projects for current user."""
    offset = (page - 1) * page_size

    # Get total count
    count_result = await db.execute(
        select(func.count(Project.id)).where(Project.user_id == current_user.id)
    )
    total = count_result.scalar_one()

    # Get projects with relationships
    result = await db.execute(
        select(Project)
        .where(Project.user_id == current_user.id)
        .options(
            selectinload(Project.model_image),
            selectinload(Project.clothing_image),
            selectinload(Project.background_image),
            selectinload(Project.reference_video),
            selectinload(Project.try_on_result),
            selectinload(Project.background_result),
            selectinload(Project.video_result),
        )
        .order_by(Project.updated_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    projects = result.scalars().all()

    return ProjectListResponse(
        projects=[ProjectResponse.model_validate(p) for p in projects],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Create a new project."""
    if not (project_data.enable_try_on or project_data.enable_background or project_data.enable_video):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one workflow must be enabled.")

    enabled_steps = {
        "try_on": bool(project_data.enable_try_on),
        "background": bool(project_data.enable_background),
        "video": bool(project_data.enable_video),
    }
    enabled_set = {k for k, v in enabled_steps.items() if v}

    steps = project_data.workflow_steps
    if steps is None:
        steps = [s for s in _BASE_STEP_ORDER if enabled_steps.get(s)]
    else:
        steps = [str(s) for s in steps]
        invalid = [s for s in steps if s not in _BASE_STEP_ORDER]
        if invalid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid workflow step(s): {invalid}")
        if set(steps) != enabled_set:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="workflow_steps must contain exactly the enabled steps (no more, no less).",
            )

    if project_data.background_person_source:
        bg_src = project_data.background_person_source.strip().lower()
    else:
        if project_data.enable_try_on and project_data.enable_background and ("try_on" in steps and "background" in steps):
            bg_src = "try_on_result" if steps.index("try_on") < steps.index("background") else "model_image"
        else:
            bg_src = "try_on_result" if project_data.enable_try_on else "model_image"
    if bg_src not in ("try_on_result", "model_image"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid background_person_source.")

    try_on_src = _normalize_person_source(project_data.try_on_person_source)
    video_src = _normalize_person_source(project_data.video_person_source)

    project = Project(
        user_id=current_user.id,
        name=project_data.name,
        status=ProjectStatus.DRAFT,
        enable_try_on=project_data.enable_try_on,
        enable_background=project_data.enable_background,
        enable_video=project_data.enable_video,
        workflow_steps=json.dumps(steps),
        background_person_source=bg_src,
        try_on_person_source=try_on_src,
        video_person_source=video_src,
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)

    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: CurrentUser,
    db: DbSession,
):
    """Get project by ID."""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.user_id == current_user.id)
        .options(
            selectinload(Project.model_image),
            selectinload(Project.clothing_image),
            selectinload(Project.background_image),
            selectinload(Project.reference_video),
            selectinload(Project.try_on_result),
            selectinload(Project.background_result),
            selectinload(Project.video_result),
        )
    )
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    return project


@router.get("/{project_id}/results", response_model=list[AssetResponse])
async def list_project_results(
    project_id: int,
    current_user: CurrentUser,
    db: DbSession,
    task_type: TaskType | None = Query(None),
    days: int = Query(7, ge=1, le=365),
):
    """List successful workflow results for a project within the last N days."""
    from datetime import datetime, timedelta, timezone

    # Verify project access
    project_check = await db.execute(
        select(Project.id).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    if project_check.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    stmt = (
        select(Asset)
        .join(Task, Task.result_asset_id == Asset.id)
        .where(Task.project_id == project_id)
        .where(Task.status == TaskStatus.SUCCESS)
        .where(Asset.created_at >= cutoff)
        .order_by(Asset.created_at.desc())
    )
    if task_type is not None:
        stmt = stmt.where(Task.task_type == task_type)

    result = await db.execute(stmt)
    assets = result.scalars().all()
    return [AssetResponse.model_validate(a) for a in assets]


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    update_data: ProjectUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Update project."""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.user_id == current_user.id)
        .options(
            selectinload(Project.model_image),
            selectinload(Project.clothing_image),
            selectinload(Project.background_image),
            selectinload(Project.reference_video),
            selectinload(Project.try_on_result),
            selectinload(Project.background_result),
            selectinload(Project.video_result),
        )
    )
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    flags_changed = False
    if update_data.name is not None:
        project.name = update_data.name
    if update_data.enable_try_on is not None:
        project.enable_try_on = update_data.enable_try_on
        flags_changed = True
    if update_data.enable_background is not None:
        project.enable_background = update_data.enable_background
        flags_changed = True
    if update_data.enable_video is not None:
        project.enable_video = update_data.enable_video
        flags_changed = True

    if update_data.background_person_source is not None:
        bg_src = update_data.background_person_source.strip().lower()
        if bg_src not in ("try_on_result", "model_image"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid background_person_source.")
        project.background_person_source = bg_src
    if update_data.try_on_person_source is not None:
        project.try_on_person_source = _normalize_person_source(update_data.try_on_person_source)
    if update_data.video_person_source is not None:
        project.video_person_source = _normalize_person_source(update_data.video_person_source)

    if update_data.workflow_steps is not None:
        enabled = {
            "try_on": bool(project.enable_try_on),
            "background": bool(project.enable_background),
            "video": bool(project.enable_video),
        }
        enabled_set = {k for k, v in enabled.items() if v}
        steps = [str(s) for s in update_data.workflow_steps]
        invalid = [s for s in steps if s not in _BASE_STEP_ORDER]
        if invalid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid workflow step(s): {invalid}")
        if set(steps) != enabled_set:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="workflow_steps must contain exactly the enabled steps (no more, no less).",
            )
        project.workflow_steps = json.dumps(steps)
    elif flags_changed:
        # Keep stored order consistent when the enabled steps set changes.
        project.workflow_steps = json.dumps(_steps_for_project(project))

    # If try-on is disabled, background can't use try-on result as its source.
    if not project.enable_try_on and (project.background_person_source or "").lower() == "try_on_result":
        project.background_person_source = "model_image"
    if "model_image_id" in update_data.model_fields_set:
        project.model_image_id = update_data.model_image_id
    if "clothing_image_id" in update_data.model_fields_set:
        project.clothing_image_id = update_data.clothing_image_id
    if "background_image_id" in update_data.model_fields_set:
        project.background_image_id = update_data.background_image_id
    if "reference_video_id" in update_data.model_fields_set:
        project.reference_video_id = update_data.reference_video_id

    await db.flush()
    await db.refresh(project)
    return project


async def _ensure_no_active_tasks(project_id: int, db: DbSession) -> None:
    res = await db.execute(
        select(func.count(Task.id))
        .where(Task.project_id == project_id)
        .where(Task.status.in_([TaskStatus.QUEUED, TaskStatus.RUNNING]))
    )
    if (res.scalar_one() or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project has a running task. Please wait for it to finish.",
        )


async def _run_project_pipeline(project_id: int) -> None:
    """Run enabled workflow steps sequentially in the background."""
    from datetime import datetime, timezone

    from app.database import async_session_maker
    from app.services.try_on import TryOnService
    from app.services.background import BackgroundService
    from app.api.tasks import submit_and_poll_task

    async with async_session_maker() as db:
        async def load_project() -> Project | None:
            # IMPORTANT: the pipeline runs in its own session, but step execution
            # (submit_and_poll_task) uses a different session to update Project result IDs.
            # Use populate_existing to avoid returning a stale identity from this session.
            res = await db.execute(
                select(Project)
                .where(Project.id == project_id)
                .execution_options(populate_existing=True)
            )
            return res.scalar_one_or_none()

        project = await load_project()
        if not project:
            return

        def mark_update(p: Project, **kwargs):
            for k, v in kwargs.items():
                setattr(p, k, v)
            p.pipeline_updated_at = datetime.now(timezone.utc)

        steps = _steps_for_project(project)

        start = project.pipeline_start_step or (steps[0] if steps else None)
        if not start or start not in steps:
            mark_update(project, pipeline_active=False, pipeline_last_error="No enabled workflow steps to run.", pipeline_current_step=None)
            project.status = ProjectStatus.FAILED
            await db.commit()
            return

        start_idx = steps.index(start)
        run_steps = steps[start_idx:]
        if not project.pipeline_chain:
            run_steps = [start]

        try:
            for step in run_steps:
                # Reload to see latest results written by other sessions.
                project = await load_project()
                if not project:
                    return

                # Stop before starting the next step if user requested cancel.
                if project.pipeline_cancel_requested:
                    mark_update(project, pipeline_active=False, pipeline_current_step=None)
                    project.status = ProjectStatus.DRAFT
                    await db.commit()
                    return

                mark_update(project, pipeline_current_step=step)
                project.status = ProjectStatus.PROCESSING
                await db.commit()

                # Create the task for this step using current project inputs/results.
                if step == "try_on":
                    source_id = _resolve_person_source_id(project, steps, "try_on")
                    if not source_id or not project.clothing_image_id:
                        raise ValueError("Missing required assets: model_image (or upstream result) and clothing_image")
                    model = await db.get(Asset, source_id)
                    clothing = await db.get(Asset, project.clothing_image_id)
                    if not model or not clothing:
                        raise ValueError("Asset not found")
                    svc = TryOnService(db)
                    task = await svc.create_task(project.id, model_image=model, clothing_image=clothing)
                    await db.commit()
                    await submit_and_poll_task(task.id, "try_on")

                elif step == "background":
                    source_id = _resolve_person_source_id(project, steps, "background")
                    if not source_id:
                        raise ValueError(
                            "Missing required asset for background: person image (try-on result or model image)"
                        )
                    if not project.background_image_id:
                        raise ValueError("Missing required asset for background: background image")
                    source = await db.get(Asset, source_id)
                    bg = await db.get(Asset, project.background_image_id) if project.background_image_id else None
                    if not source:
                        raise ValueError("Asset not found")
                    svc = BackgroundService(db)
                    task = await svc.create_task(project.id, source_image=source, background_image=bg, background_prompt=None)
                    await db.commit()
                    await submit_and_poll_task(task.id, "background")

                elif step == "video":
                    # Video module is not integrated yet; keep the pipeline architecture but stop here.
                    mark_update(
                        project,
                        pipeline_active=False,
                        pipeline_current_step=None,
                        pipeline_last_error="Video module is not integrated yet. Pipeline stopped after previous step.",
                    )
                    project.status = ProjectStatus.COMPLETED
                    await db.commit()
                    return

            # Completed all planned steps.
            project = await load_project()
            if not project:
                return
            mark_update(project, pipeline_active=False, pipeline_current_step=None)
            project.status = ProjectStatus.COMPLETED
            await db.commit()

        except Exception as e:
            project = await load_project()
            if not project:
                return
            mark_update(project, pipeline_active=False, pipeline_current_step=None, pipeline_last_error=str(e))
            project.status = ProjectStatus.FAILED
            await db.commit()


@router.post("/{project_id}/pipeline/start", response_model=ProjectResponse)
async def start_pipeline(
    project_id: int,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
    start_step: str | None = Query(None, description="try_on/background/video"),
    chain: bool = Query(True, description="When true, run subsequent enabled steps after start_step"),
):
    """Start sequential pipeline execution in the background."""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.user_id == current_user.id)
        .options(
            selectinload(Project.model_image),
            selectinload(Project.clothing_image),
            selectinload(Project.background_image),
            selectinload(Project.reference_video),
            selectinload(Project.try_on_result),
            selectinload(Project.background_result),
            selectinload(Project.video_result),
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    await _ensure_no_active_tasks(project_id, db)

    steps = _steps_for_project(project)

    step = start_step or (steps[0] if steps else None)
    if not step:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No enabled workflow steps to run.")
    if step not in steps:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_step is not in this project's workflow_steps.")
    if step == "video":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Video module is not integrated yet.")
    if step == "try_on":
        source_id = _resolve_person_source_id(project, steps, "try_on")
        if not source_id or not project.clothing_image_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required assets for try-on: model_image (or upstream result) and clothing_image",
            )
    if step == "background":
        source_id = _resolve_person_source_id(project, steps, "background")
        if not source_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required asset for background: person image (try-on result or model image)",
            )
        if not project.background_image_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required asset for background: background_image",
            )

    from datetime import datetime, timezone

    project.pipeline_active = True
    project.pipeline_cancel_requested = False
    project.pipeline_chain = chain
    project.pipeline_start_step = step
    project.pipeline_current_step = None
    project.pipeline_last_error = None
    project.pipeline_started_at = datetime.now(timezone.utc)
    project.pipeline_updated_at = project.pipeline_started_at
    project.status = ProjectStatus.PROCESSING
    await db.flush()
    await db.refresh(project)

    background_tasks.add_task(_run_project_pipeline, project.id)
    return project


@router.post("/{project_id}/pipeline/cancel", response_model=ProjectResponse)
async def cancel_pipeline(
    project_id: int,
    current_user: CurrentUser,
    db: DbSession,
):
    """Request pipeline cancellation (current step will finish, next steps won't start)."""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.user_id == current_user.id)
        .options(
            selectinload(Project.model_image),
            selectinload(Project.clothing_image),
            selectinload(Project.background_image),
            selectinload(Project.reference_video),
            selectinload(Project.try_on_result),
            selectinload(Project.background_result),
            selectinload(Project.video_result),
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    from datetime import datetime, timezone

    project.pipeline_cancel_requested = True
    project.pipeline_updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: CurrentUser,
    db: DbSession,
):
    """Delete project."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    await db.delete(project)

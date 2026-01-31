"""Celery tasks for AI processing."""
import asyncio
from datetime import datetime, timezone

from celery import shared_task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker
from app.models.task import Task, TaskType, TaskStatus
from app.models.project import Project
from app.services.runninghub import RunningHubClient, get_app_config
from app.services.usage_service import UsageService
from app.tasks.celery_app import celery_app


def run_async(coro):
    """Run async function in sync context."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, max_retries=3)
def process_ai_task(self, task_id: int):
    """
    Process an AI task (try-on, background, or video).

    This task:
    1. Submits the task to RunningHub
    2. Polls for completion
    3. Updates the database with results
    """
    run_async(_process_ai_task_async(self, task_id))


async def _process_ai_task_async(celery_task, task_id: int):
    """Async implementation of AI task processing."""
    async with async_session_maker() as db:
        # Get task from database
        result = await db.execute(
            select(Task).where(Task.id == task_id)
        )
        task = result.scalar_one_or_none()

        if task is None:
            return {"error": f"Task {task_id} not found"}

        if task.status not in (TaskStatus.PENDING, TaskStatus.QUEUED):
            return {"error": f"Task {task_id} already processed"}

        # Get project for user_id
        project_result = await db.execute(
            select(Project).where(Project.id == task.project_id)
        )
        project = project_result.scalar_one_or_none()

        if project is None:
            task.status = TaskStatus.FAILED
            task.error_message = "Project not found"
            await db.commit()
            return {"error": "Project not found"}

        client = RunningHubClient()
        app_config = get_app_config(task.task_type.value)

        try:
            # Submit to RunningHub
            task.status = TaskStatus.QUEUED
            task.started_at = datetime.now(timezone.utc)
            await db.commit()

            # Build params based on task type
            params = {}
            if task.task_type == TaskType.TRY_ON:
                params = {
                    "model_image": task.input_params.get("model_image_url"),
                    "clothing_image": task.input_params.get("clothing_image_url"),
                }
            elif task.task_type == TaskType.BACKGROUND:
                params = {
                    "source_image": task.input_params.get("source_image_url"),
                    "background_image": task.input_params.get("background_image_url"),
                }
            elif task.task_type == TaskType.VIDEO:
                params = {
                    "person_image": task.input_params.get("person_image_url"),
                    "reference_video": task.input_params.get("reference_video_url"),
                    "skip_seconds": str(task.input_params.get("skip_seconds", 0)),
                    "duration": str(task.input_params.get("duration", 10)),
                    "fps": str(task.input_params.get("fps", 30)),
                    "width": str(task.input_params.get("width", 720)),
                    "height": str(task.input_params.get("height", 1280)),
                }

            # Create task on RunningHub
            response = await client.create_task(app_config, params)

            if not response.success:
                task.status = TaskStatus.FAILED
                task.error_message = response.msg
                await db.commit()
                return {"error": response.msg}

            task.runninghub_task_id = response.task_id
            task.runninghub_client_id = response.client_id
            task.status = TaskStatus.RUNNING
            await db.commit()

            # Poll for completion
            status_response = await client.wait_for_completion(
                response.task_id,
                timeout=app_config.timeout,
            )

            # Update task with results
            if status_response.status in ("SUCCESS", "COMPLETED"):
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

                    # Record usage
                    usage_service = UsageService(db)
                    await usage_service.record_task_usage(task, project.user_id)

            else:
                task.status = TaskStatus.FAILED
                task.error_message = status_response.error_message or "Task failed"
                task.completed_at = datetime.now(timezone.utc)

            await db.commit()

            return {
                "task_id": task_id,
                "status": task.status.value,
                "result_url": task.result_url,
            }

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

            return {"error": "Task timed out"}

        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error_message = str(e)
            task.completed_at = datetime.now(timezone.utc)
            await db.commit()

            # Retry if applicable
            raise celery_task.retry(exc=e, countdown=30)


@celery_app.task
def update_task_status(task_id: int):
    """Update task status from RunningHub (for manual polling)."""
    run_async(_update_task_status_async(task_id))


async def _update_task_status_async(task_id: int):
    """Async implementation of status update."""
    async with async_session_maker() as db:
        result = await db.execute(
            select(Task).where(Task.id == task_id)
        )
        task = result.scalar_one_or_none()

        if task is None or not task.runninghub_task_id:
            return

        if task.status not in (TaskStatus.QUEUED, TaskStatus.RUNNING):
            return

        client = RunningHubClient()

        try:
            status_response = await client.get_task_status(task.runninghub_task_id)

            if status_response.status in ("SUCCESS", "COMPLETED"):
                task.status = TaskStatus.SUCCESS
                task.result_url = status_response.result_url
                task.progress_percent = 100
                task.completed_at = datetime.now(timezone.utc)

                if status_response.usage:
                    task.cost_time = status_response.usage.task_cost_time
                    task.consume_money = status_response.usage.consume_money
                    task.consume_coins = status_response.usage.consume_coins

            elif status_response.status in ("FAILED", "ERROR"):
                task.status = TaskStatus.FAILED
                task.error_message = status_response.error_message
                task.completed_at = datetime.now(timezone.utc)

            elif status_response.status == "RUNNING":
                task.progress_percent = status_response.progress

            await db.commit()

        except Exception as e:
            task.error_message = str(e)
            await db.commit()

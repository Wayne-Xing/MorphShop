"""Video generation service."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset
from app.models.task import Task, TaskType, TaskStatus
from app.services.runninghub import (
    RunningHubClient,
    get_app_config,
)


class VideoService:
    """Service for AI video generation operations."""

    def __init__(self, db: AsyncSession, client: RunningHubClient | None = None):
        self.db = db
        self.client = client or RunningHubClient()
        self.app_config = get_app_config("video")

    async def create_task(
        self,
        project_id: int,
        source_image: Asset,
        motion_type: str = "default",
        duration: int = 3,
    ) -> Task:
        """
        Create a video generation task.

        Args:
            project_id: Project ID
            source_image: Source image asset (usually background result)
            motion_type: Type of motion/animation
            duration: Video duration in seconds

        Returns:
            Created Task object
        """
        input_params = {
            "source_image_id": source_image.id,
            "source_image_url": source_image.file_url,
            "motion_type": motion_type,
            "duration": duration,
        }

        task = Task(
            project_id=project_id,
            task_type=TaskType.VIDEO,
            status=TaskStatus.PENDING,
            input_params=input_params,
        )
        self.db.add(task)
        await self.db.flush()
        await self.db.refresh(task)

        return task

    async def submit_to_runninghub(self, task: Task) -> Task:
        """
        Submit task to RunningHub API.

        Args:
            task: Task to submit

        Returns:
            Updated Task with RunningHub task ID
        """
        params = {
            "source_image": task.input_params.get("source_image_url"),
            "motion_type": task.input_params.get("motion_type", "default"),
        }

        try:
            response = await self.client.create_task(self.app_config, params)

            if response.success:
                task.status = TaskStatus.QUEUED
                task.runninghub_task_id = response.task_id
                task.runninghub_client_id = response.client_id
            else:
                task.status = TaskStatus.FAILED
                task.error_message = response.msg

        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error_message = str(e)

        await self.db.flush()
        return task

    async def update_task_status(self, task: Task) -> Task:
        """
        Update task status from RunningHub.

        Args:
            task: Task to update

        Returns:
            Updated Task
        """
        if not task.runninghub_task_id:
            return task

        try:
            status_response = await self.client.get_task_status(
                task.runninghub_task_id
            )

            rh_status = status_response.status
            if rh_status in ("SUCCESS", "COMPLETED"):
                task.status = TaskStatus.SUCCESS
                task.result_url = status_response.result_url
                task.progress_percent = 100

                if status_response.usage:
                    task.cost_time = status_response.usage.task_cost_time
                    task.consume_money = status_response.usage.consume_money
                    task.consume_coins = status_response.usage.consume_coins
                    task.third_party_cost = status_response.usage.third_party_consume_money

            elif rh_status in ("FAILED", "ERROR"):
                task.status = TaskStatus.FAILED
                task.error_message = status_response.error_message

            elif rh_status == "RUNNING":
                task.status = TaskStatus.RUNNING
                task.progress_percent = status_response.progress

            elif rh_status == "QUEUED":
                task.status = TaskStatus.QUEUED

        except Exception as e:
            task.error_message = str(e)

        await self.db.flush()
        return task

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
        person_image: Asset,
        reference_video: Asset,
        skip_seconds: int = 0,
        duration: int = 10,
        fps: int = 30,
        width: int = 720,
        height: int = 1280,
    ) -> Task:
        """
        Create a video motion transfer task.

        Args:
            project_id: Project ID
            person_image: Person image asset (usually upstream result)
            reference_video: Reference motion video asset
            skip_seconds: Seconds to skip at the start of reference video
            duration: Total output duration in seconds
            fps: Output frames per second
            width: Output video width
            height: Output video height

        Returns:
            Created Task object
        """
        input_params = {
            "person_image_id": person_image.id,
            "person_image_url": person_image.file_url,
            "reference_video_id": reference_video.id,
            "reference_video_url": reference_video.file_url,
            "skip_seconds": skip_seconds,
            "duration": duration,
            "fps": fps,
            "width": width,
            "height": height,
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
            "person_image": task.input_params.get("person_image_url"),
            "reference_video": task.input_params.get("reference_video_url"),
            "skip_seconds": str(task.input_params.get("skip_seconds", 0)),
            "duration": str(task.input_params.get("duration", 10)),
            "fps": str(task.input_params.get("fps", 30)),
            "width": str(task.input_params.get("width", 720)),
            "height": str(task.input_params.get("height", 1280)),
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

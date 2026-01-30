"""Virtual try-on service."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset
from app.models.task import Task, TaskType, TaskStatus
from app.services.runninghub import (
    RunningHubClient,
    get_app_config,
)


class TryOnService:
    """Service for virtual clothing try-on operations."""

    def __init__(self, db: AsyncSession, client: RunningHubClient | None = None):
        self.db = db
        self.client = client or RunningHubClient()
        self.app_config = get_app_config("try_on")

    async def create_task(
        self,
        project_id: int,
        model_image: Asset,
        clothing_image: Asset,
    ) -> Task:
        """
        Create a try-on task.

        Args:
            project_id: Project ID
            model_image: Model image asset
            clothing_image: Clothing image asset

        Returns:
            Created Task object
        """
        # Create task record
        task = Task(
            project_id=project_id,
            task_type=TaskType.TRY_ON,
            status=TaskStatus.PENDING,
            input_params={
                "model_image_id": model_image.id,
                "model_image_url": model_image.file_url,
                "clothing_image_id": clothing_image.id,
                "clothing_image_url": clothing_image.file_url,
            },
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
            "model_image": task.input_params.get("model_image_url"),
            "clothing_image": task.input_params.get("clothing_image_url"),
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

            # Map RunningHub status to our status
            rh_status = status_response.status
            if rh_status in ("SUCCESS", "COMPLETED"):
                task.status = TaskStatus.SUCCESS
                task.result_url = status_response.result_url
                task.progress_percent = 100

                # Extract usage info
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

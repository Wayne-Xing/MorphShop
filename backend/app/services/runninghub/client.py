"""RunningHub API client."""
import asyncio
import uuid
from typing import Any, Callable

import httpx

from app.config import get_settings
from app.services.runninghub.apps import AppConfig, build_node_inputs
from app.services.runninghub.models import TaskCreateResponse, TaskStatusResponse

settings = get_settings()


class RunningHubClient:
    """Client for RunningHub API interactions."""

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or settings.runninghub_api_key
        self.base_url = base_url or settings.runninghub_base_url
        self.timeout = httpx.Timeout(30.0, read=120.0)

    def _get_headers(self) -> dict[str, str]:
        """Get request headers with Bearer token authentication."""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    async def create_task(
        self,
        app_config: AppConfig,
        params: dict[str, Any],
        client_id: str | None = None,
    ) -> TaskCreateResponse:
        """
        Create a new task on RunningHub.

        API Endpoint: POST /openapi/v2/run/ai-app/{app_id}

        Args:
            app_config: Application configuration
            params: Input parameters (image URLs, text values, etc.)
            client_id: Optional client ID for tracking

        Returns:
            TaskCreateResponse with task_id if successful
        """
        if not client_id:
            client_id = str(uuid.uuid4())

        node_inputs = build_node_inputs(app_config, params)

        # RunningHub API payload format (Bearer token in header, no apiKey in body)
        payload = {
            "nodeInfoList": node_inputs,
            "instanceType": "default",
            "usePersonalQueue": "false",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/openapi/v2/run/ai-app/{app_config.app_id}",
                headers=self._get_headers(),
                json=payload,
            )
            response.raise_for_status()
            return TaskCreateResponse(**response.json())

    async def get_task_status(self, task_id: str) -> TaskStatusResponse:
        """
        Get task status from RunningHub.

        API Endpoint: POST /task/openapi/outputs

        Args:
            task_id: RunningHub task ID

        Returns:
            TaskStatusResponse with status and results
        """
        payload = {
            "apiKey": self.api_key,
            "taskId": task_id,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/task/openapi/outputs",
                headers=self._get_headers(),
                json=payload,
            )
            response.raise_for_status()
            return TaskStatusResponse(**response.json())

    async def cancel_task(self, task_id: str) -> bool:
        """
        Cancel a running task.

        Args:
            task_id: RunningHub task ID

        Returns:
            True if cancellation was successful
        """
        payload = {
            "apiKey": self.api_key,
            "taskId": task_id,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/openapi/v2/task/cancel",
                headers=self._get_headers(),
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("code") == 0

    async def upload_file(self, file_data: bytes, filename: str) -> str | None:
        """
        Upload a file (image/video) to RunningHub.

        API Endpoint: POST /task/openapi/upload

        Args:
            file_data: File bytes
            filename: Original filename

        Returns:
            fileName of uploaded file if successful (e.g., "api/xxxx.png")
        """
        # Determine mime type from filename
        suffix = filename.lower().split(".")[-1] if "." in filename else "bin"
        mime_types = {
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "webp": "image/webp",
            "mp4": "video/mp4",
        }
        mime_type = mime_types.get(suffix, "application/octet-stream")

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            files = {"file": (filename, file_data, mime_type)}
            data = {"apiKey": self.api_key}
            response = await client.post(
                f"{self.base_url}/task/openapi/upload",
                data=data,
                files=files,
            )
            response.raise_for_status()
            result = response.json()
            if result.get("code") == 0:
                # Returns fileName like "api/xxxx.png"
                return result.get("data", {}).get("fileName")
            return None

    async def upload_image(self, image_data: bytes, filename: str) -> str | None:
        """Upload image to RunningHub (compat wrapper)."""
        return await self.upload_file(image_data, filename)

    async def wait_for_completion(
        self,
        task_id: str,
        poll_interval: float = 3.0,
        timeout: float = 300.0,
        on_progress: Callable | None = None,
    ) -> TaskStatusResponse:
        """
        Wait for task to complete with polling.

        Args:
            task_id: RunningHub task ID
            poll_interval: Seconds between polls
            timeout: Maximum wait time in seconds
            on_progress: Optional callback(status, progress, elapsed) called on each poll

        Returns:
            Final TaskStatusResponse

        Raises:
            TimeoutError: If task doesn't complete within timeout
        """
        elapsed = 0.0
        while elapsed < timeout:
            status = await self.get_task_status(task_id)

            # Call progress callback if provided
            if on_progress:
                # Estimate progress based on elapsed time if not provided
                progress = status.progress
                if progress == 0 and status.status == "RUNNING":
                    # Estimate: assume 60 seconds average, cap at 95%
                    progress = min(95, int(elapsed / 60 * 100))
                try:
                    await on_progress(status.status, progress, elapsed)
                except Exception:
                    pass  # Don't let callback errors break polling

            # Check various success states
            if status.status in ("SUCCESS", "COMPLETED", "FINISH"):
                return status
            if status.status in ("FAILED", "ERROR", "CANCELLED", "FAIL"):
                return status

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        raise TimeoutError(f"Task {task_id} did not complete within {timeout} seconds")


# Global client instance
runninghub_client = RunningHubClient()

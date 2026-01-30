"""RunningHub API data models."""
from typing import Any

from pydantic import BaseModel, Field


class TaskUsage(BaseModel):
    """Usage information from RunningHub task completion."""
    consume_money: float | None = Field(None, alias="consumeMoney")
    consume_coins: int | None = Field(None, alias="consumeCoins")
    task_cost_time: int | None = Field(None, alias="taskCostTime")
    third_party_consume_money: float | None = Field(None, alias="thirdPartyConsumeMoney")

    model_config = {"populate_by_name": True}


class TaskResult(BaseModel):
    """Single result item from RunningHub."""
    url: str | None = None
    output_type: str | None = Field(None, alias="outputType")
    text: str | None = None
    file_url: str | None = Field(None, alias="fileUrl")  # Alternative field name

    model_config = {"populate_by_name": True}

    @property
    def result_url(self) -> str | None:
        """Get the result URL from either 'url' or 'fileUrl' field."""
        return self.url or self.file_url


class TaskCreateResponse(BaseModel):
    """Response from task creation API.

    RunningHub returns different formats:
    - Success: {"taskId": "xxx", "status": "RUNNING", "clientId": "xxx", ...}
    - Error: {"taskId": "", "errorCode": "xxx", "errorMessage": "xxx", ...}
    """
    task_id: str | None = Field(None, alias="taskId")
    status: str | None = None
    error_code: str | None = Field(None, alias="errorCode")
    error_message: str | None = Field(None, alias="errorMessage")
    client_id: str | None = Field(None, alias="clientId")
    prompt_tips: str | None = Field(None, alias="promptTips")
    failed_reason: dict[str, Any] | None = Field(None, alias="failedReason")
    results: list[dict[str, Any]] | None = None
    usage: dict[str, Any] | None = None

    model_config = {"populate_by_name": True}

    @property
    def success(self) -> bool:
        return bool(self.task_id) and self.status in ("RUNNING", "QUEUED", "SUCCESS")


class TaskStatusResponse(BaseModel):
    """Response from task status API.

    RunningHub has multiple response formats:

    Format 1a (legacy dict):
    - Success: {"code": 0, "msg": "success", "data": {"outputs": [...], ...}}
    - Running: {"code": 804, "msg": "TASK_RUNNING", ...}
    - Failed: {"code": 805, "msg": "APIKEY_TASK_STATUS_ERROR", "data": {"failedReason": {...}}}

    Format 1b (legacy list):
    - Success: {"code": 0, "msg": "success", "data": [{"fileUrl": "...", "consumeCoins": "..."}]}

    Format 2 (current):
    - Success: {"taskId": "xxx", "status": "SUCCESS", "results": [{url, outputType}], ...}
    - Running: {"taskId": "xxx", "status": "RUNNING", ...}
    - Failed: {"taskId": "xxx", "status": "FAILED", "errorMessage": "xxx", ...}
    """
    # Format 1 fields - data can be dict or list
    code: int | None = None
    msg: str | None = None
    data: dict[str, Any] | list[dict[str, Any]] | None = None

    # Format 2 fields
    task_id: str | None = Field(None, alias="taskId")
    status_field: str | None = Field(None, alias="status")
    results: list[dict[str, Any]] | None = None
    error_code: str | None = Field(None, alias="errorCode")
    error_msg: str | None = Field(None, alias="errorMessage")
    failed_reason_field: dict[str, Any] | None = Field(None, alias="failedReason")
    usage_field: dict[str, Any] | None = Field(None, alias="usage")
    client_id: str | None = Field(None, alias="clientId")
    progress_field: int | None = Field(None, alias="progress")

    model_config = {"populate_by_name": True}

    @property
    def _is_format2(self) -> bool:
        """Check if response is in format 2 (has taskId or status field)."""
        return self.task_id is not None or self.status_field is not None

    @property
    def _data_is_list(self) -> bool:
        """Check if data field is a list (Format 1b)."""
        return isinstance(self.data, list)

    @property
    def success(self) -> bool:
        if self._is_format2:
            return self.status_field == "SUCCESS"
        return self.code == 0

    @property
    def is_running(self) -> bool:
        if self._is_format2:
            return self.status_field in ("RUNNING", "QUEUED", None)
        # Empty response or code 804 means still running
        if self.code is None and self.msg is None:
            return True
        return self.code == 804 or self.msg == "TASK_RUNNING"

    @property
    def is_failed(self) -> bool:
        if self._is_format2:
            return self.status_field == "FAILED" or bool(self.error_msg)
        return self.code == 805 or self.msg == "APIKEY_TASK_STATUS_ERROR"

    @property
    def status(self) -> str:
        if self._is_format2:
            if self.status_field == "SUCCESS":
                return "SUCCESS"
            if self.status_field == "FAILED" or self.error_msg:
                return "FAILED"
            if self.status_field in ("RUNNING", "QUEUED"):
                return "RUNNING"
            return "RUNNING"  # Default to running for format 2
        # Format 1 logic
        if self.success:
            return "SUCCESS"
        if self.is_failed:
            return "FAILED"
        if self.is_running:
            return "RUNNING"
        return "UNKNOWN"

    @property
    def progress(self) -> int:
        if self._is_format2:
            return self.progress_field or 0
        if self.data and isinstance(self.data, dict):
            return self.data.get("progress", 0)
        return 0

    @property
    def outputs(self) -> list[dict[str, Any]]:
        if self._is_format2:
            return self.results or []
        if self.data:
            # Format 1b: data is directly a list of outputs
            if isinstance(self.data, list):
                return self.data
            # Format 1a: data is dict with outputs key
            return self.data.get("outputs", [])
        return []

    @property
    def result_url(self) -> str | None:
        outputs = self.outputs
        if outputs:
            # Get the first output file URL
            for output in outputs:
                # Format 2 uses "url", Format 1 uses "fileUrl"
                if "url" in output and output["url"]:
                    return output["url"]
                if "fileUrl" in output and output["fileUrl"]:
                    return output["fileUrl"]
        return None

    @property
    def usage(self) -> TaskUsage | None:
        if self._is_format2:
            if self.usage_field:
                return TaskUsage(**self.usage_field)
            return None
        if self.data:
            # Format 1b: usage might be in the list items
            if isinstance(self.data, list) and self.data:
                # Try to extract usage from the first item
                first_item = self.data[0]
                if any(k in first_item for k in ["consumeMoney", "consumeCoins", "taskCostTime"]):
                    return TaskUsage(**first_item)
            # Format 1a: usage in dict
            elif isinstance(self.data, dict) and "usage" in self.data:
                return TaskUsage(**self.data["usage"])
        return None

    @property
    def error_message(self) -> str | None:
        if self._is_format2:
            return self.error_msg
        if self.data and isinstance(self.data, dict):
            failed_reason = self.data.get("failedReason", {})
            if failed_reason:
                return failed_reason.get("exception_type", self.msg)
        return self.msg if self.is_failed else None

    @property
    def failed_reason(self) -> dict[str, Any] | None:
        if self._is_format2:
            return self.failed_reason_field
        if self.data and isinstance(self.data, dict):
            return self.data.get("failedReason")
        return None

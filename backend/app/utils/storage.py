"""File storage utilities."""
import os
import uuid
from datetime import datetime
from pathlib import Path

import aiofiles

from app.config import get_settings

settings = get_settings()


class StorageService:
    """Local file storage service with cloud storage interface."""

    def __init__(self, base_dir: str | None = None):
        self.base_dir = Path(base_dir or settings.upload_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _generate_filename(self, original_filename: str) -> str:
        """Generate unique filename with timestamp and UUID."""
        ext = Path(original_filename).suffix.lower()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        return f"{timestamp}_{unique_id}{ext}"

    def _get_date_path(self) -> str:
        """Get date-based subdirectory path."""
        return datetime.now().strftime("%Y/%m/%d")

    async def save_file(
        self,
        content: bytes,
        original_filename: str,
        subfolder: str = "images"
    ) -> tuple[str, str]:
        """
        Save file to storage.

        Returns:
            tuple: (relative_path, filename)
        """
        filename = self._generate_filename(original_filename)
        date_path = self._get_date_path()

        # Create directory structure
        dir_path = self.base_dir / subfolder / date_path
        dir_path.mkdir(parents=True, exist_ok=True)

        # Save file
        file_path = dir_path / filename
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)

        relative_path = f"{subfolder}/{date_path}/{filename}"
        return relative_path, filename

    async def delete_file(self, relative_path: str) -> bool:
        """Delete file from storage."""
        file_path = self.base_dir / relative_path
        try:
            if file_path.exists():
                os.remove(file_path)
                return True
            return False
        except OSError:
            return False

    def get_file_url(self, relative_path: str) -> str:
        """
        Get public URL for file.

        For local storage, returns API path.
        Override this for cloud storage implementations.
        """
        return f"/api/files/{relative_path}"

    def get_absolute_path(self, relative_path: str) -> Path:
        """Get absolute filesystem path for file."""
        return self.base_dir / relative_path


# Global storage instance
storage = StorageService()

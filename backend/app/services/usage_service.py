"""Usage tracking and quota management service."""
from datetime import date

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.task import Task, TaskStatus
from app.models.usage_stats import UsageStats, SystemConfig
from app.models.user import User

settings = get_settings()


class UsageService:
    """Service for tracking usage and managing quotas."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_user_daily_stats(self, user_id: int, target_date: date | None = None) -> UsageStats | None:
        """Get user's daily usage statistics."""
        if target_date is None:
            target_date = date.today()

        result = await self.db.execute(
            select(UsageStats).where(
                UsageStats.user_id == user_id,
                UsageStats.date == target_date
            )
        )
        return result.scalar_one_or_none()

    async def get_or_create_daily_stats(self, user_id: int, target_date: date | None = None) -> UsageStats:
        """Get or create daily usage statistics for user."""
        if target_date is None:
            target_date = date.today()

        stats = await self.get_user_daily_stats(user_id, target_date)
        if stats is None:
            stats = UsageStats(
                user_id=user_id,
                date=target_date,
            )
            self.db.add(stats)
            await self.db.flush()
            await self.db.refresh(stats)

        return stats

    async def record_task_usage(self, task: Task, user_id: int) -> None:
        """Record task usage after completion."""
        if task.status != TaskStatus.SUCCESS:
            return

        stats = await self.get_or_create_daily_stats(user_id)

        stats.total_tasks += 1
        stats.total_cost_time += task.cost_time or 0
        stats.total_consume_money += task.consume_money or 0.0
        stats.total_consume_coins += task.consume_coins or 0

        # Update user's credits used
        user_result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalar_one_or_none()
        if user and task.consume_money:
            user.credits_used += task.consume_money

        await self.db.flush()

    async def check_user_quota(self, user_id: int) -> tuple[bool, str | None]:
        """
        Check if user has remaining quota for today.

        Returns:
            tuple: (allowed, error_message)
        """
        stats = await self.get_user_daily_stats(user_id)

        if stats:
            # Check daily task limit
            if stats.total_tasks >= settings.daily_user_limit_tasks:
                return False, f"Daily task limit ({settings.daily_user_limit_tasks}) reached"

            # Check daily money limit
            if stats.total_consume_money >= settings.daily_user_limit_money:
                return False, f"Daily spending limit (${settings.daily_user_limit_money}) reached"

        # Check user credits
        user_result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalar_one_or_none()
        if user and user.credits <= 0:
            return False, "Insufficient credits"

        return True, None

    async def get_system_config(self, key: str) -> str | None:
        """Get system configuration value."""
        result = await self.db.execute(
            select(SystemConfig).where(SystemConfig.key == key)
        )
        config = result.scalar_one_or_none()
        return config.value if config else None

    async def set_system_config(self, key: str, value: str, description: str | None = None) -> SystemConfig:
        """Set system configuration value."""
        result = await self.db.execute(
            select(SystemConfig).where(SystemConfig.key == key)
        )
        config = result.scalar_one_or_none()

        if config:
            config.value = value
            if description:
                config.description = description
        else:
            config = SystemConfig(key=key, value=value, description=description)
            self.db.add(config)

        await self.db.flush()
        await self.db.refresh(config)
        return config

    async def get_global_usage_today(self) -> dict:
        """Get global usage statistics for today."""
        today = date.today()

        result = await self.db.execute(
            select(
                func.sum(UsageStats.total_tasks).label("total_tasks"),
                func.sum(UsageStats.total_cost_time).label("total_cost_time"),
                func.sum(UsageStats.total_consume_money).label("total_money"),
                func.sum(UsageStats.total_consume_coins).label("total_coins"),
            ).where(UsageStats.date == today)
        )
        row = result.one()

        return {
            "date": today.isoformat(),
            "total_tasks": row.total_tasks or 0,
            "total_cost_time": row.total_cost_time or 0,
            "total_consume_money": float(row.total_money or 0),
            "total_consume_coins": row.total_coins or 0,
        }

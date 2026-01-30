"""Add workflow toggles, asset display name, and task result asset link.

Revision ID: 20260130_000001
Revises: 001
Create Date: 2026-01-30 00:00:01.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260130_000001"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # assets.display_name
    op.add_column("assets", sa.Column("display_name", sa.String(length=255), nullable=True))

    # projects workflow toggles
    op.add_column(
        "projects",
        sa.Column("enable_try_on", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "projects",
        sa.Column("enable_background", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "projects",
        sa.Column("enable_video", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    # tasks.result_asset_id -> assets.id
    op.add_column("tasks", sa.Column("result_asset_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_tasks_result_asset_id"), "tasks", ["result_asset_id"], unique=False)
    op.create_foreign_key(
        "fk_tasks_result_asset_id_assets",
        "tasks",
        "assets",
        ["result_asset_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_tasks_result_asset_id_assets", "tasks", type_="foreignkey")
    op.drop_index(op.f("ix_tasks_result_asset_id"), table_name="tasks")
    op.drop_column("tasks", "result_asset_id")

    op.drop_column("projects", "enable_video")
    op.drop_column("projects", "enable_background")
    op.drop_column("projects", "enable_try_on")

    op.drop_column("assets", "display_name")


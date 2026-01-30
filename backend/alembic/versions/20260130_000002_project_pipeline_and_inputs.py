"""Project pipeline state + inputs (background image, reference video).

Revision ID: 20260130_000002
Revises: 20260130_000001
Create Date: 2026-01-30
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260130_000002"
down_revision = "20260130_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new enum value for storing reference videos.
    op.execute("ALTER TYPE assettype ADD VALUE IF NOT EXISTS 'reference_video'")

    # Project inputs (optional background image / reference video for future video module).
    op.add_column("projects", sa.Column("background_image_id", sa.Integer(), nullable=True))
    op.add_column("projects", sa.Column("reference_video_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_projects_background_image_id_assets",
        "projects",
        "assets",
        ["background_image_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_projects_reference_video_id_assets",
        "projects",
        "assets",
        ["reference_video_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Pipeline runtime state (kept simple as scalar columns).
    op.add_column(
        "projects",
        sa.Column("pipeline_active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "projects",
        sa.Column("pipeline_cancel_requested", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "projects",
        sa.Column("pipeline_chain", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column("projects", sa.Column("pipeline_start_step", sa.String(length=20), nullable=True))
    op.add_column("projects", sa.Column("pipeline_current_step", sa.String(length=20), nullable=True))
    op.add_column("projects", sa.Column("pipeline_last_error", sa.Text(), nullable=True))
    op.add_column("projects", sa.Column("pipeline_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("projects", sa.Column("pipeline_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # NOTE: Postgres enums cannot easily remove values; we leave assettype as-is.
    op.drop_column("projects", "pipeline_updated_at")
    op.drop_column("projects", "pipeline_started_at")
    op.drop_column("projects", "pipeline_last_error")
    op.drop_column("projects", "pipeline_current_step")
    op.drop_column("projects", "pipeline_start_step")
    op.drop_column("projects", "pipeline_chain")
    op.drop_column("projects", "pipeline_cancel_requested")
    op.drop_column("projects", "pipeline_active")

    op.drop_constraint("fk_projects_reference_video_id_assets", "projects", type_="foreignkey")
    op.drop_constraint("fk_projects_background_image_id_assets", "projects", type_="foreignkey")
    op.drop_column("projects", "reference_video_id")
    op.drop_column("projects", "background_image_id")


"""Add video motion transfer parameters.

Revision ID: 20260131_000006
Revises: 20260131_000005
Create Date: 2026-01-31
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260131_000006"
down_revision = "20260131_000005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("video_skip_seconds", sa.Integer(), nullable=True))
    op.add_column("projects", sa.Column("video_duration", sa.Integer(), nullable=True))
    op.add_column("projects", sa.Column("video_fps", sa.Integer(), nullable=True))
    op.add_column("projects", sa.Column("video_width", sa.Integer(), nullable=True))
    op.add_column("projects", sa.Column("video_height", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "video_height")
    op.drop_column("projects", "video_width")
    op.drop_column("projects", "video_fps")
    op.drop_column("projects", "video_duration")
    op.drop_column("projects", "video_skip_seconds")

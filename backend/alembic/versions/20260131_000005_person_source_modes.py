"""Add per-step person source modes.

Revision ID: 20260131_000005
Revises: 20260130_000004
Create Date: 2026-01-31
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260131_000005"
down_revision = "20260130_000004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("try_on_person_source", sa.String(length=30), nullable=True))
    op.add_column("projects", sa.Column("video_person_source", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "video_person_source")
    op.drop_column("projects", "try_on_person_source")

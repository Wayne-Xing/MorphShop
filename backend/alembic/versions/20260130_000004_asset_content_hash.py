"""Add content hash to assets for deduplication.

Revision ID: 20260130_000004
Revises: 20260130_000003
Create Date: 2026-01-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260130_000004"
down_revision = "20260130_000003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("assets", sa.Column("content_hash", sa.String(length=64), nullable=True))
    # Optional index to speed up "unique by content" lookups.
    op.create_index("ix_assets_user_content_hash", "assets", ["user_id", "content_hash"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_assets_user_content_hash", table_name="assets")
    op.drop_column("assets", "content_hash")


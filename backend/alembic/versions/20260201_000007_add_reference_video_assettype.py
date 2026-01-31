"""Add REFERENCE_VIDEO to assettype enum.

Revision ID: 20260201_000007
Revises: 20260131_000006
Create Date: 2026-02-01
"""

from __future__ import annotations

from alembic import op


revision = "20260201_000007"
down_revision = "20260131_000006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE assettype ADD VALUE IF NOT EXISTS 'REFERENCE_VIDEO'")


def downgrade() -> None:
    # Postgres enums do not support removing values without type recreation.
    pass

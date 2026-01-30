"""Workflow order and step input sources.

Revision ID: 20260130_000003
Revises: 20260130_000002
Create Date: 2026-01-30
"""

from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op


revision = "20260130_000003"
down_revision = "20260130_000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Store ordered steps as JSON text for SQLite compatibility.
    op.add_column("projects", sa.Column("workflow_steps", sa.Text(), nullable=True, server_default="[]"))
    op.add_column(
        "projects",
        sa.Column("background_person_source", sa.String(length=30), nullable=True, server_default="try_on_result"),
    )

    conn = op.get_bind()

    projects = sa.table(
        "projects",
        sa.column("id", sa.Integer()),
        sa.column("enable_try_on", sa.Boolean()),
        sa.column("enable_background", sa.Boolean()),
        sa.column("enable_video", sa.Boolean()),
        sa.column("workflow_steps", sa.Text()),
        sa.column("background_person_source", sa.String(length=30)),
    )

    rows = conn.execute(
        sa.select(
            projects.c.id,
            projects.c.enable_try_on,
            projects.c.enable_background,
            projects.c.enable_video,
        )
    ).fetchall()

    base = ["try_on", "background", "video"]
    for r in rows:
        enabled = {
            "try_on": bool(r.enable_try_on),
            "background": bool(r.enable_background),
            "video": bool(r.enable_video),
        }
        steps = [s for s in base if enabled.get(s)]
        bg_src = "try_on_result" if enabled.get("try_on") else "model_image"

        conn.execute(
            sa.update(projects)
            .where(projects.c.id == r.id)
            .values(
                workflow_steps=json.dumps(steps),
                background_person_source=bg_src,
            )
        )

    # Note: we intentionally keep columns nullable for SQLite simplicity; application treats NULL as default.


def downgrade() -> None:
    op.drop_column("projects", "background_person_source")
    op.drop_column("projects", "workflow_steps")

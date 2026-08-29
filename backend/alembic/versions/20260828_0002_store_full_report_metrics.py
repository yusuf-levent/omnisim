"""store full report metrics

Revision ID: 20260828_0002
Revises: 20260828_0001
Create Date: 2026-08-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260828_0002"
down_revision: Union[str, None] = "20260828_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("report_results", sa.Column("status_badge", sa.String(), nullable=True))
    op.add_column("report_results", sa.Column("correct_actions", sa.Integer(), nullable=True))
    op.add_column("report_results", sa.Column("incorrect_actions", sa.Integer(), nullable=True))
    op.add_column("report_results", sa.Column("reaction_score", sa.Integer(), nullable=True))
    op.add_column("report_results", sa.Column("criteria_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("report_results", "criteria_json")
    op.drop_column("report_results", "reaction_score")
    op.drop_column("report_results", "incorrect_actions")
    op.drop_column("report_results", "correct_actions")
    op.drop_column("report_results", "status_badge")

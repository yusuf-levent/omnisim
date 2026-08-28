"""initial schema

Revision ID: 20260828_0001
Revises:
Create Date: 2026-08-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260828_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sim_sessions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("scenario_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("turn_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "interaction_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("turn_no", sa.Integer(), nullable=True),
        sa.Column("user_message", sa.Text(), nullable=True),
        sa.Column("patient_dialogue", sa.Text(), nullable=True),
        sa.Column("system_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["sim_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_interaction_logs_session_id"), "interaction_logs", ["session_id"], unique=False)
    op.create_table(
        "report_results",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("strengths", sa.Text(), nullable=True),
        sa.Column("errors", sa.Text(), nullable=True),
        sa.Column("suggestions", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["sim_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id"),
    )
    op.create_table(
        "vital_states",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("heart_rate", sa.Integer(), nullable=True),
        sa.Column("blood_pressure", sa.String(), nullable=True),
        sa.Column("spo2", sa.Integer(), nullable=True),
        sa.Column("consciousness", sa.String(), nullable=True),
        sa.Column("turn_no", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["sim_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vital_states_session_id"), "vital_states", ["session_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_vital_states_session_id"), table_name="vital_states")
    op.drop_table("vital_states")
    op.drop_table("report_results")
    op.drop_index(op.f("ix_interaction_logs_session_id"), table_name="interaction_logs")
    op.drop_table("interaction_logs")
    op.drop_table("sim_sessions")

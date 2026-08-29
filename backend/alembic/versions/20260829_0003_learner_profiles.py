"""learner profiles

Revision ID: 20260829_0003
Revises: 20260828_0002
Create Date: 2026-08-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260829_0003"
down_revision: Union[str, None] = "20260828_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    op.create_table(
        "learner_profiles",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("training_track", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("sim_sessions", sa.Column("learner_id", sa.String(), nullable=True))
    op.create_index(op.f("ix_sim_sessions_learner_id"), "sim_sessions", ["learner_id"], unique=False)
    if bind.dialect.name != "sqlite":
        op.create_foreign_key(
            "fk_sim_sessions_learner_id",
            "sim_sessions",
            "learner_profiles",
            ["learner_id"],
            ["id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.drop_constraint("fk_sim_sessions_learner_id", "sim_sessions", type_="foreignkey")
    op.drop_index(op.f("ix_sim_sessions_learner_id"), table_name="sim_sessions")
    op.drop_column("sim_sessions", "learner_id")
    op.drop_table("learner_profiles")

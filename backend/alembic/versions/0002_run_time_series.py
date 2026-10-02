"""Store lightweight chart series with simulation run history.

Revision ID: 0002_run_series
Revises: 0001_initial
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_run_series"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing compact runs predate chart series. Preserve their history with
    # an empty, valid baseline rather than reconstructing points from summaries.
    op.add_column("simulation_runs", sa.Column("time_series", postgresql.JSONB(), nullable=False, server_default=sa.text("'{\"queue_lengths\":{},\"cumulative_completed\":[]}'::jsonb")))
    op.alter_column("simulation_runs", "time_series", server_default=None)


def downgrade() -> None:
    op.drop_column("simulation_runs", "time_series")

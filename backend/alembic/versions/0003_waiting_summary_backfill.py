"""Keep older run summaries readable after adding waiting-time metrics.

Revision ID: 0003_waiting_summary
Revises: 0002_run_series
"""

from alembic import op

revision = "0003_waiting_summary"
down_revision = "0002_run_series"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Older runs have no event log from which to reconstruct these figures.
    op.execute("UPDATE simulation_runs SET summary = summary || jsonb_build_object('average_waiting_time', NULL, 'maximum_waiting_time', NULL) WHERE NOT (summary ? 'average_waiting_time')")


def downgrade() -> None:
    pass

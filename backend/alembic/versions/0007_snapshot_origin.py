"""Separate project snapshots from scenario snapshots without deleting history."""
from alembic import op
import sqlalchemy as sa

revision = "0007_snapshot_origin"
down_revision = "0006_project_activity"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("simulation_model_versions", sa.Column("is_scenario", sa.Boolean(), nullable=False, server_default=sa.false()))
    # Only classify historical snapshots for which the database retains evidence.
    # Old edits/deleted scenarios without runs have no recoverable origin marker.
    op.execute("""
        UPDATE simulation_model_versions AS v SET is_scenario = TRUE
        WHERE EXISTS (SELECT 1 FROM scenarios s WHERE s.project_id = v.project_id AND s.version = v.version)
           OR EXISTS (SELECT 1 FROM simulation_runs r WHERE r.project_id = v.project_id AND r.version = v.version AND r.scenario_id IS NOT NULL)
    """)


def downgrade():
    op.drop_column("simulation_model_versions", "is_scenario")

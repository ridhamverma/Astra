"""Named model snapshots and scenario run associations."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_scenarios"
down_revision = "0003_waiting_summary"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "scenarios",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id", "version"], ["simulation_model_versions.project_id", "simulation_model_versions.version"], name="fk_scenario_project_version"),
    )
    op.create_index("ix_scenarios_project_id", "scenarios", ["project_id"])
    op.add_column("simulation_runs", sa.Column("scenario_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_run_scenario", "simulation_runs", "scenarios", ["scenario_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_simulation_runs_scenario_id", "simulation_runs", ["scenario_id"])


def downgrade():
    op.drop_index("ix_simulation_runs_scenario_id", table_name="simulation_runs")
    op.drop_constraint("fk_run_scenario", "simulation_runs", type_="foreignkey")
    op.drop_column("simulation_runs", "scenario_id")
    op.drop_index("ix_scenarios_project_id", table_name="scenarios")
    op.drop_table("scenarios")

"""Password hashes and revocable sessions; legacy unowned projects stay private."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = "0005_authentication"
down_revision = "0004_scenarios"
branch_labels = depends_on = None

def upgrade():
    op.add_column("users", sa.Column("password_hash", sa.String(500), nullable=True))
    op.create_index("ix_projects_user_id", "projects", ["user_id"])
    op.create_table("auth_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])

def downgrade():
    op.drop_table("auth_sessions")
    op.drop_index("ix_projects_user_id", table_name="projects")
    op.drop_column("users", "password_hash")

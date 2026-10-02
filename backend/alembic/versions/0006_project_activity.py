"""Remember project opens independently of edits for the Recents workspace."""
from alembic import op
import sqlalchemy as sa

revision = "0006_project_activity"
down_revision = "0005_authentication"
branch_labels = depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("projects", "last_accessed_at")

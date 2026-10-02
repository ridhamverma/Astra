#!/usr/bin/env sh
set -e

# Execute database migrations if database URL is configured and migrations are enabled
if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ -n "${ASTRA_DATABASE_URL:-$DATABASE_URL}" ]; then
  echo "==> Running database migrations (alembic upgrade head)..."
  alembic upgrade head
  echo "==> Migrations completed."
fi

PORT="${PORT:-8000}"
echo "==> Starting Astra backend server on port ${PORT}..."
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --workers 1 \
  --limit-concurrency 16 \
  --timeout-keep-alive 5 \
  --proxy-headers \
  --forwarded-allow-ips='*'


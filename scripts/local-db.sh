#!/usr/bin/env bash
# Starts a throwaway local Postgres for development (never the production Neon DB).
set -euo pipefail
CONTAINER=maruposu-dev
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker start "$CONTAINER" 2>/dev/null || docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=maruposu -p 55433:5432 postgres:16-alpine
  sleep 3
fi
echo "DATABASE_URL=postgresql://postgres:dev@localhost:55433/maruposu"

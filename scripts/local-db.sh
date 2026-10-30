#!/usr/bin/env bash
# Starts a throwaway local Postgres for development (never the production Neon DB).
set -euo pipefail
CONTAINER=maruposu-dev
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker start "$CONTAINER" 2>/dev/null || docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=maruposu -p 55433:5432 postgres:16-alpine
  sleep 3
fi
# Databases for the replica and for `npm run test:db`
for db in maruposu_replica maruposu_test; do
  docker exec "$CONTAINER" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
    || docker exec "$CONTAINER" psql -U postgres -qc "CREATE DATABASE $db"
done
echo "DATABASE_URL=postgresql://postgres:dev@localhost:55433/maruposu"
echo "DATABASE_URL_REPLICA=postgresql://postgres:dev@localhost:55433/maruposu_replica"

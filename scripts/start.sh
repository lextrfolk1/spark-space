#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

check_port() {
  local port="$1"
  if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use."
    exit 1
  fi
}

require_command docker
require_command lsof

if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "Created .env from .env.example"
fi

source "$ROOT_DIR/.env"

check_port "${APP_PORT:-8000}"
check_port "${FRONTEND_PORT:-4173}"
check_port "${POSTGRES_PORT:-5432}"
check_port "${MINIO_PORT:-9000}"
check_port "${MINIO_CONSOLE_PORT:-9001}"
check_port "${SPARK_MASTER_PORT:-7077}"
check_port "${SPARK_UI_PORT:-8081}"

docker compose -f "$ROOT_DIR/docker-compose.yml" up -d --build

echo "Waiting for services to become healthy..."
for service in postgres minio spark backend frontend; do
  retries=30
  until [ "$retries" -eq 0 ] || docker compose -f "$ROOT_DIR/docker-compose.yml" ps "$service" | grep -q "healthy"; do
    sleep 4
    retries=$((retries - 1))
  done
  if [ "$retries" -eq 0 ]; then
    echo "Service $service did not report healthy in time."
    docker compose -f "$ROOT_DIR/docker-compose.yml" ps
    exit 1
  fi
done

cat <<EOF
Execution Workspace is running.
Frontend:      http://localhost:${FRONTEND_PORT:-4173}
Backend:       http://localhost:${APP_PORT:-8000}
API Docs:      http://localhost:${APP_PORT:-8000}/docs
Spark UI:      http://localhost:${SPARK_UI_PORT:-8081}
MinIO Console: http://localhost:${MINIO_CONSOLE_PORT:-9001}
EOF


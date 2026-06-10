#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

service_running() {
  local service="$1"
  docker compose --env-file "$ROOT_DIR/.env" -f "$COMPOSE_FILE" ps "$service" 2>/dev/null | grep -q "Up"
}

check_port() {
  local port="$1"
  local service="$2"
  if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    if service_running "$service"; then
      echo "Port $port is already in use by the existing $service container. Reusing it."
    else
      echo "Port $port is already in use."
      exit 1
    fi
  fi
}

wait_for_health() {
  local service="$1"
  local retries="${2:-30}"
  local sleep_seconds="${3:-4}"

  until [ "$retries" -eq 0 ] || docker compose --env-file "$ROOT_DIR/.env" -f "$COMPOSE_FILE" ps "$service" | grep -Eq "healthy|Up"; do
    sleep "$sleep_seconds"
    retries=$((retries - 1))
  done

  if [ "$retries" -eq 0 ]; then
    return 1
  fi
}

require_command docker
require_command lsof

if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "Created .env from .env.example"
fi

source "$ROOT_DIR/.env"

check_port "${APP_PORT:-8000}" backend
check_port "${FRONTEND_PORT:-4173}" frontend
check_port "${MINIO_PORT:-9000}" minio
check_port "${MINIO_CONSOLE_PORT:-9001}" minio
check_port "${SPARK_MASTER_PORT:-7077}" spark
check_port "${SPARK_UI_PORT:-8081}" spark

docker compose --env-file "$ROOT_DIR/.env" -f "$COMPOSE_FILE" up -d --build postgres backend frontend minio spark

echo "Waiting for services to become healthy..."
for service in postgres backend frontend; do
  if ! wait_for_health "$service" 30 4; then
    echo "Critical service $service did not become ready in time."
    docker compose --env-file "$ROOT_DIR/.env" -f "$COMPOSE_FILE" ps
    exit 1
  fi
done

for service in minio spark; do
  if ! wait_for_health "$service" 10 3; then
    echo "Warning: optional service $service is not healthy yet."
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

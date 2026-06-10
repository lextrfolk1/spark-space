@echo off
set ROOT_DIR=%~dp0..
docker compose -f "%ROOT_DIR%\docker-compose.yml" down


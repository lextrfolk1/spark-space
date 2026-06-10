@echo off
set ROOT_DIR=%~dp0..
if not exist "%ROOT_DIR%\.env" copy "%ROOT_DIR%\.env.example" "%ROOT_DIR%\.env"
docker compose -f "%ROOT_DIR%\docker-compose.yml" up -d --build
echo Frontend: http://localhost:4173
echo Backend:  http://localhost:8000


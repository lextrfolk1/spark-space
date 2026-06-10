# Local Setup Guide

## Prerequisites

- Docker and Docker Compose
- 8 GB RAM minimum recommended
- Ports `4173`, `5432`, `8000`, `8081`, `9000`, and `9001` available

## Start The Platform

```bash
cp .env.example .env
./scripts/start.sh
```

## Stop The Platform

```bash
./scripts/stop.sh
```

## Inspect Status

```bash
./scripts/status.sh
./scripts/logs.sh backend
```

## Key URLs

- Frontend: `http://localhost:4173`
- Backend: `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`
- Spark UI: `http://localhost:8081`
- MinIO Console: `http://localhost:9001`


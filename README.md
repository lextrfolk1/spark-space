# Execution Workspace

Execution Workspace is a Dockerized notebook-style data execution platform built for enterprise teams that need a flexible editor today and a rule-engine-ready execution architecture tomorrow.

The repository ships with:

- A FastAPI backend with pluggable execution engines
- A React and Monaco-powered notebook UI
- PostgreSQL metadata storage
- Local and S3-compatible object storage hooks
- Docker Compose assets for local bring-up
- Operational scripts and architecture documentation

## Quick Start

```bash
cp .env.example .env
./scripts/start.sh
```

Once healthy, open:

- Frontend: `http://localhost:4173`
- Backend API: `http://localhost:8000/docs`
- Spark UI: `http://localhost:8081`
- MinIO Console: `http://localhost:9001`

## Repository Layout

```text
backend/    FastAPI application, execution framework, persistence, storage services
frontend/   React application, notebook workspace, catalog and admin views
config/     YAML configuration defaults
docker/     Dockerfiles
docs/       Architecture, setup, deployment, and future-engine guides
scripts/    Start, stop, status, restart, and log utilities
```

## Current Delivery Scope

This implementation provides a production-style foundation with:

- A generic execution request/response model
- Spark SQL, Spark DataFrame, and Rule Engine executor contracts
- Dataset, datasource, history, and log management APIs
- File upload and dataset registration flows
- A rich notebook workspace and supporting application shell

Spark-backed execution is intentionally isolated behind the execution pipeline, so a future parser and rule planner can slot in without redesigning the UI.

## Docs

- [Architecture Overview](docs/architecture.md)
- [Local Setup](docs/local-setup.md)
- [Configuration Guide](docs/configuration.md)
- [Deployment Guide](docs/deployment.md)
- [Future Rule Engine Guide](docs/future-rule-engine.md)


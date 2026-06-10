# Configuration Guide

Configuration flows through three layers:

1. `config/application.yml` provides default application structure.
2. `.env` overrides environment-sensitive values.
3. Container runtime variables can override either layer.

## Important Settings

- `DATABASE_URL`: PostgreSQL metadata database
- `CONFIG_FILE`: Mounted YAML configuration path
- `EXECUTION_TIMEOUT_MS`: Max execution runtime
- `EXECUTION_MAX_ROWS`: Result cap for preview and execution output
- `UPLOAD_MAX_FILE_SIZE_MB`: Upload guardrail
- `RULE_ENGINE_ENABLED`: Enables the rule-engine placeholder path
- `OBJECT_STORAGE_PROVIDER`: `local` or future S3-compatible provider switch

## Datasource Bootstrapping

Configured datasources belong in `config/application.yml` under `datasource.configured_connections`.

Runtime datasources are created via `POST /api/datasources` and stored in PostgreSQL with encrypted passwords.


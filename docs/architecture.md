# Architecture Overview

Execution Workspace is designed around a generic execution pipeline so the editor remains stable while execution engines evolve.

## System Architecture

```mermaid
flowchart LR
  UI[React Notebook UI] --> API[FastAPI API Layer]
  API --> Parser[Parser Abstraction]
  Parser --> AST[AST / Parsed Command]
  AST --> Planner[Execution Planner]
  Planner --> Engine[Execution Engine Registry]
  Engine --> SparkSql[Spark SQL Executor]
  Engine --> SparkDf[Spark DataFrame Executor]
  Engine --> Rule[Rule Engine Executor]
  API --> Meta[(PostgreSQL Metadata)]
  API --> Storage[(Local or S3-Compatible Storage)]
  SparkSql --> Spark[(Spark / Spark Connect)]
  SparkDf --> Spark
  Rule --> Spark
```

## Component View

```mermaid
flowchart TD
  Shell[Application Shell] --> Workspace[Notebook Workspace]
  Shell --> Datasets[Dataset Catalog]
  Shell --> Connections[Connection Manager]
  Shell --> History[Execution History]
  Shell --> Logs[Operational Logs]
  Workspace --> ExecuteAPI[/POST /api/execute/]
  Datasets --> UploadAPI[/POST /api/datasets/upload/]
  Datasets --> RegisterAPI[/POST /api/datasets/register/]
  Connections --> DatasourceAPI[/api/datasources/]
```

## Execution Sequence

```mermaid
sequenceDiagram
  participant User
  participant UI
  participant API
  participant Parser
  participant Planner
  participant Executor
  participant History

  User->>UI: Execute cell
  UI->>API: POST /api/execute
  API->>Parser: parse(request)
  Parser->>Planner: parsed command
  Planner->>Executor: execution plan
  Executor-->>API: normalized result
  API->>History: persist execution record
  API-->>UI: execution response
```

## Backend Modules

- `app/api`: HTTP routes and contract mapping
- `app/services/execution`: engine-agnostic execution pipeline and executors
- `app/services/storage`: dataset staging, preview, and metadata inference
- `app/services/datasources`: configured and runtime datasource inventory
- `app/models`: metadata persistence models
- `app/core`: config, logging, and security primitives

## Frontend Modules

- `components/layout`: shell and navigation
- `components/notebook`: notebook workspace and cell renderer
- `features/*/pages`: route-level screens for datasets, connections, history, logs, and settings
- `store/notebook-store.ts`: notebook cell state and orchestration
- `lib/api.ts`: shared API client


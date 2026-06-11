# SparkSpace Notebook Platform

SparkSpace is a Dockerized notebook-style data workbench built for enterprise teams that need a flexible data editor today and an extensible execution architecture for tomorrow.

The repository ships with:
- A FastAPI backend with pluggable execution engines (Strategy + Factory + Adapter patterns)
- A React + Monaco-powered notebook UI
- PostgreSQL metadata storage for notebook persistence, datasets, and connections
- Local and MinIO/S3-compatible object storage hooks
- Docker Compose assets for local build and bring-up
- Operational scripts and architecture documentation

---

## Quick Start

```bash
cp .env.example .env
./scripts/start.sh
```

Once healthy, open:
- **Frontend**: `http://localhost:4173`
- **Backend API**: `http://localhost:8000/docs`
- **Spark UI**: `http://localhost:8081`
- **MinIO Console**: `http://localhost:9001`

---

## Repository Layout

```text
backend/    FastAPI application, execution framework, persistence, storage services
frontend/   React application, notebook workspace, catalog, and connections views
config/     YAML configuration defaults
docker/     Dockerfiles
docs/       Architecture, setup, deployment, and future-engine guides
scripts/    Start, stop, status, restart, and log utilities
```

---

## Extending the Platform

SparkSpace is designed using clean OOP patterns, making it highly modular and extensible. Below are instructions for adding new capabilities.

### 1. How to Add a New Executor (Strategy Pattern)
All cell executions flow through the `Executor` abstract base class. To add a new execution strategy (e.g., Natural Language parsing, Rule evaluation, or Python dataframe logic):

1. Define a class implementing the `Executor` interface in `backend/app/services/execution/base.py`:
   ```python
   from app.services.execution.base import Executor, ValidationResult, ExecutionPlanV2, RawResult
   from app.schemas.notebooks import CellExecuteRequest, CellExecuteResponse

   class MyNewExecutor(Executor):
       async def validate(self, request: CellExecuteRequest) -> ValidationResult:
           # Validate syntax or context requirements
           return ValidationResult(valid=True)

       async def plan(self, request: CellExecuteRequest, **kwargs) -> ExecutionPlanV2:
           # Resolve dependencies and output an execution plan
           return ExecutionPlanV2(engine="my_engine", command=request.content, cell_type=request.cell_type, input_type=request.input_type)

       async def execute(self, plan: ExecutionPlanV2) -> RawResult:
           # Run computation and return a raw result
           return RawResult(status="completed", rows=[{"col1": "val1"}])

       async def format_response(self, result: RawResult, request: CellExecuteRequest) -> CellExecuteResponse:
           # Format raw result to DTO
           return CellExecuteResponse(execution_id="...", status="SUCCESS", execution_type="MY_TYPE", rows=result.rows)
   ```
2. Register the executor in `backend/app/services/execution/factory.py` (or directly register it in `ExecutorFactory`).

### 2. How to Add a New Data Source Adapter (Adapter Pattern)
If you want to support a new database (e.g., Snowflake, BigQuery, or MySQL), implement a new adapter:

1. Inherit from `DataSourceAdapter` in `backend/app/services/execution/base.py`:
   ```python
   class SnowflakeAdapter(DataSourceAdapter):
       async def connect(self, config: dict) -> None:
           # Establish connection pool
           pass
       async def execute_query(self, query: str, limit: int = 100) -> RawResult:
           # Query db, convert to raw result
           pass
       async def get_schema(self, table_name: str | None = None) -> list[dict]:
           # Return table metadata
           pass
       async def disconnect(self) -> None:
           # Close connections
           pass
       def supports(self, datasource_type: str) -> bool:
           return datasource_type.upper() == "SNOWFLAKE"
   ```
2. Register it in your adapter registry so executors can load it dynamically based on the connection type.

### 3. How to Add a New Result Renderer (Factory Pattern)
The frontend uses a dynamic renderer framework. To add a new visual rendering tab (e.g. Map, Chart, or Pivot Table):

1. Create a component in `frontend/src/components/renderers/MyRenderer.tsx` conforming to the `RendererProps` interface.
2. Import and register the new component in `frontend/src/components/renderers/index.tsx`:
   ```typescript
   const RENDERERS: Record<string, React.ComponentType<RendererProps>> = {
     TABLE: TableRenderer,
     JSON: JsonRenderer,
     MY_RENDER_TYPE: MyRenderer, // Add here
   };
   ```

### 4. How to Add a New Cell Type
To add a new editor type (e.g., Rule Builder, SQL Visual Query Builder, or LLM chat interface):

1. Add a new default configuration to `CELL_TYPE_DEFAULTS` inside `frontend/src/store/notebook-store.ts`.
2. Define a new React component under `frontend/src/components/notebook/cell-types/MyNewCellEditor.tsx`.
3. In `frontend/src/components/notebook/notebook-cell.tsx`, import your new editor, add the metadata to `CELL_TYPE_META`, and mount your component inside the cell view.

---

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Local Setup](docs/local-setup.md)
- [Configuration Guide](docs/configuration.md)
- [Deployment Guide](docs/deployment.md)
- [Future Rule Engine Guide](docs/future-rule-engine.md)

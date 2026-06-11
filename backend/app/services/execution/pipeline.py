from __future__ import annotations

import ast
import asyncio
import json
import re
import sqlite3
import time
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlparse

import asyncpg
import pandas as pd
from pyspark.sql import SparkSession
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import ConfiguredDatasource, RuntimeSettings
from app.core.security import CredentialCipher
from app.models.entities import DatasetRecord, DatasourceRecord, ExecutionRecord
from app.schemas.executions import ExecutionRequest, ExecutionResponse
from app.services.logbook import log_book

_READ_ONLY_SQL = re.compile(r"^\s*(select|with)\b", re.IGNORECASE)
_SINGLE_EQUALS = re.compile(r"(?<![<>=!])=(?!=)")
_SPARK_SESSIONS: dict[str, SparkSession] = {}


@dataclass
class ParsedCommand:
    engine: str
    command: str
    execution_mode: str
    context: dict[str, Any]


@dataclass
class ExecutionPlan:
    engine: str
    command: str
    datasets: list[DatasetRecord]
    datasource_id: str | None
    datasource: DatasourceRecord | ConfiguredDatasource | None
    limit: int
    execution_mode: str
    context: dict[str, Any]


@dataclass
class ExecutionPayload:
    status: str
    schema: list[dict[str, Any]]
    rows: list[dict[str, Any]]
    logs: list[str]
    warnings: list[str]
    error: str | None
    statistics: dict[str, Any]
    dataframe_metadata: dict[str, Any]


class CommandParser(Protocol):
    def parse(self, request: ExecutionRequest) -> ParsedCommand: ...


class Executor(Protocol):
    async def execute(self, plan: ExecutionPlan) -> ExecutionPayload: ...


class PassthroughParser:
    def parse(self, request: ExecutionRequest) -> ParsedCommand:
        return ParsedCommand(
            engine=request.engine,
            command=request.command.strip(),
            execution_mode=request.execution_mode,
            context=request.context,
        )


class SparkSqlExecutor:
    async def execute(self, plan: ExecutionPlan) -> ExecutionPayload:
        if not plan.command:
            return _failed_payload("No SQL command provided.", "Command cannot be empty", engine="spark_sql")

        if not _READ_ONLY_SQL.match(plan.command):
            return _failed_payload(
                "Only read-only SELECT statements are supported in the local Spark SQL runner.",
                "Unsupported SQL statement. Use SELECT or WITH queries only.",
                engine="spark_sql",
            )

        logs = ["Execution routed through SparkSqlExecutor."]
        warnings: list[str] = []

        if plan.datasource is not None:
            try:
                result_frame, live_statistics = await _execute_live_sql(plan, plan.command, plan.limit)
            except Exception as exc:
                return _failed_payload(
                    "Spark SQL execution failed against the live datasource.",
                    str(exc),
                    engine="spark_sql",
                    logs=logs,
                    warnings=warnings,
                )

            datasource_name = plan.datasource.name
            return ExecutionPayload(
                status="completed",
                schema=_schema_from_frame(result_frame),
                rows=_rows_from_frame(result_frame),
                logs=logs
                + [
                    f"Connected to live datasource `{datasource_name}`.",
                    "SQL query completed against the remote database.",
                ],
                warnings=warnings,
                error=None,
                statistics={
                    "engine": "spark_sql",
                    "mode": "live_datasource",
                    "datasource": datasource_name,
                    **live_statistics,
                },
                dataframe_metadata={"normalized": True, "localExecution": False},
            )

        if not plan.datasets:
            return _failed_payload(
                "Select at least one registered dataset or choose a supported datasource before running Spark SQL.",
                "No dataset or executable datasource was provided.",
                engine="spark_sql",
            )

        try:
            result_frame = _execute_local_sql(plan, plan.command, plan.limit)
        except Exception as exc:  # pragma: no cover - exercised through tests, sqlite/pandas error types vary
            return _failed_payload(
                "Spark SQL execution failed during local validation.",
                str(exc),
                engine="spark_sql",
                logs=logs,
                warnings=warnings,
            )

        return ExecutionPayload(
            status="completed",
            schema=_schema_from_frame(result_frame),
            rows=_rows_from_frame(result_frame),
            logs=logs
            + [
                f"Registered {len(plan.datasets)} dataset(s) in the local execution context.",
                "SQL query completed against in-memory tables.",
            ],
            warnings=warnings,
            error=None,
            statistics={
                "engine": "spark_sql",
                "datasets": [dataset.name for dataset in plan.datasets],
                "returnedRows": len(result_frame.index),
            },
            dataframe_metadata={"normalized": True, "localExecution": True},
        )

class SparkDataFrameExecutor:
    async def execute(self, plan: ExecutionPlan) -> ExecutionPayload:
        if not plan.command:
            return _failed_payload("No DataFrame command provided.", "Command cannot be empty", engine="spark_dataframe")

        base_name, operations = self._parse_dataframe_command(plan.command)
        dataset = None
        result_frame: pd.DataFrame
        if operations and operations[0][0] == "sql":
            try:
                result_frame, dataset, operations = self._run_sql_backed_dataframe(plan, operations)
            except Exception as exc:
                return _failed_payload(
                    f"Spark DataFrame SQL execution failed for alias `{base_name}`.",
                    str(exc),
                    engine="spark_dataframe",
                )
        else:
            dataset = next((ds for ds in plan.datasets if ds.name == base_name), None)
            if dataset is None:
                dataset = self._resolve_dataset(plan)
            if dataset is None:
                message = "Select a registered dataset before running Spark DataFrame commands."
                if plan.datasource is not None:
                    message = "Live datasource execution is not implemented yet. Bind a registered dataset for local DataFrame execution."
                return _failed_payload(message, message, engine="spark_dataframe")

            frame = plan.context.get("dataset_frames", {}).get(dataset.id)
            if frame is None:
                return _failed_payload(
                    f"Dataset `{dataset.name}` is not available in the execution context.",
                    f"Dataset `{dataset.name}` could not be loaded for execution.",
                    engine="spark_dataframe",
                )

            try:
                result_frame = self._apply_dataframe_operations(frame.copy(), operations)
            except Exception as exc:
                return _failed_payload(
                    f"Spark DataFrame execution failed for dataset alias `{base_name}`.",
                    str(exc),
                    engine="spark_dataframe",
                )

        limited_frame = result_frame.head(plan.limit)
        warnings: list[str] = []
        if plan.datasource is not None:
            target_name = dataset.name if dataset is not None else "selected datasets"
            warnings.append(
                f"Validated datasource `{plan.datasource.name}` but executed against {target_name} in local mode."
            )

        operation_labels = [self._format_operation(method_name, args) for method_name, args in operations]
        bound_target = dataset.name if dataset is not None else ", ".join(item.name for item in plan.datasets)

        return ExecutionPayload(
            status="completed",
            schema=_schema_from_frame(limited_frame),
            rows=_rows_from_frame(limited_frame),
            logs=[
                "Execution routed through SparkDataFrameExecutor.",
                f"Bound DataFrame context to `{bound_target}`.",
                f"Applied operations: {', '.join(operation_labels) if operation_labels else 'preview'}",
            ],
            warnings=warnings,
            error=None,
            statistics={
                "engine": "spark_dataframe",
                "dataset": dataset.name if dataset is not None else None,
                "datasets": [item.name for item in plan.datasets],
                "returnedRows": len(limited_frame.index),
                "resultRowsBeforeLimit": len(result_frame.index),
            },
            dataframe_metadata={
                "api": "pyspark",
                "localExecution": True,
                "datasetAlias": base_name,
                "operations": operation_labels,
            },
        )

    @staticmethod
    def _resolve_dataset(plan: ExecutionPlan) -> DatasetRecord | None:
        if not plan.datasets:
            return None
        if len(plan.datasets) == 1:
            return plan.datasets[0]
        return None

    def _parse_dataframe_command(self, command: str) -> tuple[str, list[tuple[str, list[Any]]]]:
        expression = self._extract_expression(command)
        return self._flatten_operations(expression)

    def _run_sql_backed_dataframe(
        self,
        plan: ExecutionPlan,
        operations: list[tuple[str, list[Any]]],
    ) -> tuple[pd.DataFrame, DatasetRecord | None, list[tuple[str, list[Any]]]]:
        if not operations:
            raise ValueError("`sql` requires a query argument.")

        method_name, args = operations[0]
        if method_name != "sql":
            raise ValueError("The SQL-backed DataFrame path must start with `.sql(...)`.")
        if len(args) != 1:
            raise ValueError("`sql` expects exactly one SQL string argument.")

        query = self._expect_string(args[0], "sql")
        if not plan.datasets:
            message = "Select a registered dataset before running Spark DataFrame commands."
            if plan.datasource is not None:
                message = "Live datasource execution is not implemented yet. Bind a registered dataset for local DataFrame execution."
            raise ValueError(message)

        result = _execute_local_sql(plan, query, plan.limit)
        dataset = plan.datasets[0] if len(plan.datasets) == 1 else None
        return self._apply_dataframe_operations(result, operations[1:]), dataset, operations

    def _apply_dataframe_operations(
        self,
        frame: pd.DataFrame,
        operations: list[tuple[str, list[Any]]],
    ) -> pd.DataFrame:
        result = frame
        for method_name, args in operations:
            if method_name == "sql":
                raise ValueError("`sql` is only supported as the first DataFrame operation.")

            if method_name == "select":
                columns = [self._expect_string(value, "select") for value in args]
                self._ensure_columns(result, columns)
                result = result.loc[:, columns]
                continue

            if method_name in {"filter", "where"}:
                if len(args) != 1:
                    raise ValueError(f"`{method_name}` expects exactly one condition string.")
                condition = self._expect_string(args[0], method_name)
                normalized = _SINGLE_EQUALS.sub("==", condition)
                result = result.query(normalized, engine="python")
                continue

            if method_name in {"limit", "head", "show"}:
                if len(args) != 1:
                    raise ValueError(f"`{method_name}` expects exactly one numeric argument.")
                count = self._expect_int(args[0], method_name)
                result = result.head(count)
                continue

            raise ValueError(
                f"Unsupported DataFrame operation `{method_name}`. Supported operations: sql, select, filter, where, limit, head, show."
            )

        return result

    @staticmethod
    def _extract_expression(command: str) -> ast.expr:
        module = ast.parse(command, mode="exec")
        if len(module.body) != 1:
            raise ValueError("Use a single DataFrame expression per cell in local execution mode.")
        statement = module.body[0]
        if isinstance(statement, ast.Expr):
            value = statement.value
        elif isinstance(statement, ast.Assign):
            value = statement.value
        else:
            raise ValueError("Only assignment or expression-style DataFrame commands are supported locally.")
        if not isinstance(value, ast.expr):
            raise ValueError("Unable to parse the DataFrame command.")
        return value

    def _flatten_operations(self, expression: ast.expr) -> tuple[str, list[tuple[str, list[Any]]]]:
        if isinstance(expression, ast.Name):
            return expression.id, []

        if isinstance(expression, ast.Call) and isinstance(expression.func, ast.Attribute):
            base_name, operations = self._flatten_operations(expression.func.value)
            if expression.keywords:
                raise ValueError("Keyword arguments are not supported in local DataFrame execution.")
            parsed_args = [self._literal_value(argument) for argument in expression.args]
            return base_name, operations + [(expression.func.attr, parsed_args)]

        raise ValueError("Unsupported DataFrame command format for local execution.")

    @staticmethod
    def _literal_value(node: ast.expr) -> Any:
        try:
            return ast.literal_eval(node)
        except Exception as exc:  # pragma: no cover - ast error types vary
            raise ValueError("Only literal arguments are supported in local DataFrame execution.") from exc

    @staticmethod
    def _ensure_columns(frame: pd.DataFrame, columns: list[str]) -> None:
        missing = [column for column in columns if column not in frame.columns]
        if missing:
            raise ValueError(f"Unknown column(s): {', '.join(missing)}")

    @staticmethod
    def _expect_string(value: Any, operation: str) -> str:
        if not isinstance(value, str):
            raise ValueError(f"`{operation}` expects string arguments.")
        return value

    @staticmethod
    def _expect_int(value: Any, operation: str) -> int:
        if not isinstance(value, int):
            raise ValueError(f"`{operation}` expects an integer argument.")
        return value

    @staticmethod
    def _format_operation(method_name: str, args: list[Any]) -> str:
        return f"{method_name}({', '.join(repr(arg) for arg in args)})"


class RuleEngineExecutor:
    def __init__(self, settings: RuntimeSettings) -> None:
        self.settings = settings

    async def execute(self, plan: ExecutionPlan) -> ExecutionPayload:
        if not self.settings.rule_engine.enabled:
            return ExecutionPayload(
                status="failed",
                schema=[],
                rows=[],
                logs=["Rule execution request received."],
                warnings=[],
                error="Rule engine is disabled in configuration.",
                statistics={"engine": "rule_engine"},
                dataframe_metadata={},
            )
        return ExecutionPayload(
            status="completed",
            schema=[],
            rows=[],
            logs=["Rule engine placeholder accepted the request."],
            warnings=["Parser and planner placeholders are active until the rule engine implementation lands."],
            error=None,
            statistics={"engine": "rule_engine"},
            dataframe_metadata={"normalized": True},
        )


class ExecutionRegistry:
    def __init__(self, settings: RuntimeSettings) -> None:
        self._executors: dict[str, Executor] = {
            "spark_sql": SparkSqlExecutor(),
            "spark_dataframe": SparkDataFrameExecutor(),
            "rule_engine": RuleEngineExecutor(settings),
        }

    def get_executor(self, engine: str) -> Executor:
        return self._executors[engine]


class ExecutionService:
    def __init__(self, settings: RuntimeSettings) -> None:
        self.settings = settings
        self.parser: CommandParser = PassthroughParser()
        self.registry = ExecutionRegistry(settings)

    async def execute(self, session: AsyncSession, request: ExecutionRequest) -> ExecutionResponse:
        started = time.perf_counter()
        parsed = self.parser.parse(request)
        
        # Automatically detect referenced datasets (only if no datasource is selected)
        detected_dataset_ids = [] if request.datasource_id is not None else list(request.dataset_ids)
        if request.datasource_id is None:
            all_datasets_stmt = select(DatasetRecord)
            all_datasets_result = await session.execute(all_datasets_stmt)
            all_datasets = all_datasets_result.scalars().all()
            for ds in all_datasets:
                pattern = re.compile(rf"\b{re.escape(ds.name)}\b", re.IGNORECASE)
                if pattern.search(request.command) and ds.id not in detected_dataset_ids:
                    detected_dataset_ids.append(ds.id)
                
        datasets = await self._load_datasets(session, detected_dataset_ids)
        missing_dataset_ids = [dataset_id for dataset_id in request.dataset_ids if dataset_id not in {row.id for row in datasets}]
        datasource = await self._load_datasource(session, request.datasource_id)
        execution_limit = min(
            request.limit or self.settings.execution.default_limit,
            self.settings.execution.max_rows,
        )
        preview_context = await self._build_dataset_context(datasets)
        log_book.add("execution", "info", f"Executing {request.engine} command in {request.execution_mode} mode")
        if missing_dataset_ids:
            payload = _failed_payload(
                f"Requested dataset(s) were not found: {', '.join(missing_dataset_ids)}",
                f"Unknown dataset id(s): {', '.join(missing_dataset_ids)}",
                engine=request.engine,
            )
        elif request.datasource_id is not None and datasource is None:
            payload = _failed_payload(
                f"Requested datasource `{request.datasource_id}` was not found.",
                f"Unknown datasource id: {request.datasource_id}",
                engine=request.engine,
            )
        else:
            plan = ExecutionPlan(
                engine=parsed.engine,
                command=parsed.command,
                datasets=datasets,
                datasource_id=request.datasource_id,
                datasource=datasource,
                limit=execution_limit,
                execution_mode=parsed.execution_mode,
                context={**parsed.context, **preview_context, **self._build_datasource_context(datasource)},
            )
            payload = await self.registry.get_executor(request.engine).execute(plan)
        duration_ms = int((time.perf_counter() - started) * 1000)

        record = ExecutionRecord(
            engine=request.engine,
            dataset_id=detected_dataset_ids[0] if detected_dataset_ids else None,
            datasource_id=request.datasource_id,
            command=request.command,
            status=payload.status,
            duration_ms=duration_ms,
            schema_json=payload.schema,
            rows_json=payload.rows,
            logs_json=payload.logs,
            warnings_json=payload.warnings,
            error_message=payload.error,
            statistics_json=payload.statistics,
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)

        return ExecutionResponse(
            execution_id=record.id,
            status=payload.status,
            schema=payload.schema,
            rows=payload.rows,
            row_count=len(payload.rows),
            dataframe_metadata=payload.dataframe_metadata,
            logs=payload.logs,
            warnings=payload.warnings,
            error=payload.error,
            execution_time_ms=duration_ms,
            statistics=payload.statistics,
            dataset_ids=detected_dataset_ids,
        )

    async def history(self, session: AsyncSession) -> list[ExecutionRecord]:
        return (await session.execute(select(ExecutionRecord).order_by(ExecutionRecord.created_at.desc()))).scalars().all()

    async def get_execution(self, session: AsyncSession, execution_id: str) -> ExecutionRecord | None:
        return await session.get(ExecutionRecord, execution_id)

    async def _load_datasets(self, session: AsyncSession, dataset_ids: list[str]) -> list[DatasetRecord]:
        if not dataset_ids:
            return []
        rows = (await session.execute(select(DatasetRecord).where(DatasetRecord.id.in_(dataset_ids)))).scalars().all()
        datasets_by_id = {row.id: row for row in rows}
        return [datasets_by_id[dataset_id] for dataset_id in dataset_ids if dataset_id in datasets_by_id]

    async def _load_datasource(
        self,
        session: AsyncSession,
        datasource_id: str | None,
    ) -> DatasourceRecord | ConfiguredDatasource | None:
        if datasource_id is None:
            return None

        configured = next(
            (item for item in self.settings.datasource.configured_connections if item.id == datasource_id),
            None,
        )
        if configured is not None:
            return configured

        return await session.get(DatasourceRecord, datasource_id)

    async def _build_dataset_context(self, datasets: list[DatasetRecord]) -> dict[str, Any]:
        from app.core.config import get_settings
        from app.services.storage.datasets import DatasetFileService

        file_service = DatasetFileService(get_settings())
        previews: dict[str, list[dict[str, Any]]] = {}
        schemas: dict[str, list[dict[str, Any]]] = {}
        frames: dict[str, pd.DataFrame] = {}
        for dataset in datasets:
            metadata = dataset.metadata_json or {}
            frame = file_service.load_dataframe(
                dataset.location,
                limit=self.settings.execution.max_rows,
                delimiter=metadata.get("delimiter", ","),
                has_header=metadata.get("has_header", True),
            )
            frames[dataset.id] = frame
            preview_frame = frame.head(self.settings.execution.default_limit)
            previews[dataset.id] = _rows_from_frame(preview_frame)
            schemas[dataset.id] = _schema_from_frame(preview_frame)
        return {"dataset_previews": previews, "dataset_schemas": schemas, "dataset_frames": frames}

    def _build_datasource_context(self, datasource: DatasourceRecord | ConfiguredDatasource | None) -> dict[str, Any]:
        if datasource is None:
            return {}

        if isinstance(datasource, DatasourceRecord):
            cipher = CredentialCipher(self.settings.app_credential_key)
            return {
                "live_datasource": {
                    "name": datasource.name,
                    "type": datasource.type,
                    "host": datasource.host,
                    "hosts": _candidate_hosts(datasource.host),
                    "port": datasource.port,
                    "database": datasource.database,
                    "schema_name": datasource.schema_name,
                    "username": datasource.username,
                    "password": cipher.decrypt(datasource.encrypted_password),
                    "runtime_managed": True,
                }
            }

        configured = datasource.model_dump()
        configured["hosts"] = _candidate_hosts(datasource.host)
        credentials = _configured_postgres_credentials(self.settings, datasource)
        configured.update(credentials)
        return {"live_datasource": configured}


def _schema_from_frame(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [{"name": name, "type": str(dtype)} for name, dtype in frame.dtypes.items()]


def _rows_from_frame(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return json.loads(frame.to_json(orient="records", date_format="iso"))


def _candidate_hosts(host: str) -> list[str]:
    normalized = host.strip()
    hosts = [normalized]
    if normalized in {"localhost", "127.0.0.1", "::1"}:
        hosts.append("host.docker.internal")
    return hosts


def _configured_postgres_credentials(settings: RuntimeSettings, datasource: ConfiguredDatasource) -> dict[str, Any]:
    if datasource.type != "POSTGRESQL":
        return {"username": None, "password": None}

    parsed = urlparse(settings.database_url)
    db_scheme = parsed.scheme.split("+")[-1]
    db_port = parsed.port or 5432
    db_name = parsed.path.lstrip("/") or None
    if db_scheme != "asyncpg":
        return {"username": None, "password": None}

    if parsed.hostname == datasource.host and db_port == datasource.port and db_name == datasource.database:
        return {
            "username": parsed.username,
            "password": parsed.password,
        }
    return {"username": None, "password": None}


async def _execute_live_sql(plan: ExecutionPlan, query: str, limit: int) -> tuple[pd.DataFrame, dict[str, Any]]:
    datasource: dict[str, Any] | None = plan.context.get("live_datasource")
    if datasource is None:
        raise ValueError("Datasource context is missing for live execution.")

    datasource_type = (datasource.get("type") or "").upper()
    if datasource_type == "SPARK":
        return await _execute_spark_connect_sql(plan, datasource, query, limit)

    if datasource_type != "POSTGRESQL":
        raise ValueError(f"Live datasource execution currently supports POSTGRESQL only, not `{datasource_type}`.")

    username = datasource.get("username")
    password = datasource.get("password")
    database = datasource.get("database")
    if not username or password is None or not database:
        raise ValueError(
            "This datasource does not have executable credentials in the backend yet. "
            "Create it as a runtime-managed PostgreSQL connection with username and password."
        )

    last_error: Exception | None = None
    for host in datasource.get("hosts") or [datasource.get("host")]:
        connection: asyncpg.Connection | None = None
        try:
            connection = await asyncpg.connect(
                host=host,
                port=datasource.get("port"),
                user=username,
                password=password,
                database=database,
                timeout=3,
            )
            schema_name = datasource.get("schema_name")
            if schema_name:
                await connection.fetchval("SELECT set_config('search_path', $1, false)", schema_name)

            stripped_query = query.strip().rstrip(";")
            limited_query = f"SELECT * FROM ({stripped_query}) AS workspace_result LIMIT {limit}"
            statement = await connection.prepare(limited_query)
            records = await statement.fetch()
            rows = [dict(record) for record in records]
            frame = pd.DataFrame(rows)
            if rows:
                frame = frame.reindex(columns=list(rows[0].keys()))
            else:
                frame = pd.DataFrame(columns=[attribute.name for attribute in statement.get_attributes()])
            return frame, {"host": host, "returnedRows": len(rows)}
        except Exception as exc:  # pragma: no cover - network/database errors vary
            last_error = exc
        finally:
            if connection is not None:
                await connection.close()

    if last_error is not None:
        raise ValueError(str(last_error)) from last_error
    raise ValueError("Unable to connect to the live datasource.")


async def _execute_spark_connect_sql(
    plan: ExecutionPlan,
    datasource: dict[str, Any],
    query: str,
    limit: int,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    last_error: Exception | None = None
    for host in datasource.get("hosts") or [datasource.get("host")]:
        remote = f"sc://{host}:{datasource.get('port')}"
        try:
            spark = await asyncio.to_thread(_get_spark_connect_session, remote, datasource)
            result_frame = await asyncio.to_thread(_run_spark_sql, spark, query, limit)
            return result_frame, {"host": host, "mode": "spark_connect", "returnedRows": len(result_frame.index)}
        except Exception as exc:  # pragma: no cover - Spark client errors vary
            last_error = exc

    if last_error is not None:
        raise ValueError(str(last_error)) from last_error
    raise ValueError("Unable to connect to the Spark datasource.")


def _get_spark_connect_session(remote: str, datasource: dict[str, Any]) -> SparkSession:
    existing = _SPARK_SESSIONS.get(remote)
    if existing is not None:
        return existing

    builder = SparkSession.builder.remote(remote).appName("execution-workspace")
    session = builder.getOrCreate()
    _SPARK_SESSIONS[remote] = session
    return session


def _run_spark_sql(spark: SparkSession, query: str, limit: int) -> pd.DataFrame:
    dataframe = spark.sql(query.strip().rstrip(";")).limit(limit)
    pandas_frame = dataframe.toPandas()
    if pandas_frame.empty:
        pandas_frame = pd.DataFrame(columns=dataframe.columns)
    return pandas_frame


def _execute_local_sql(plan: ExecutionPlan, query: str, limit: int) -> pd.DataFrame:
    connection = sqlite3.connect(":memory:")
    try:
        frames: dict[str, pd.DataFrame] = plan.context.get("dataset_frames", {})
        for dataset in plan.datasets:
            frame = frames.get(dataset.id)
            if frame is None:
                raise ValueError(f"Dataset `{dataset.name}` is not available in the execution context.")
            frame.to_sql(dataset.name, connection, index=False, if_exists="replace")

        stripped_query = query.strip().rstrip(";")
        limited_query = f"SELECT * FROM ({stripped_query}) AS workspace_result LIMIT {limit}"
        return pd.read_sql_query(limited_query, connection)
    finally:
        connection.close()


def _failed_payload(
    log_message: str,
    error_message: str,
    *,
    engine: str,
    logs: list[str] | None = None,
    warnings: list[str] | None = None,
) -> ExecutionPayload:
    return ExecutionPayload(
        status="failed",
        schema=[],
        rows=[],
        logs=(logs or []) + [log_message],
        warnings=warnings or [],
        error=error_message,
        statistics={"engine": engine},
        dataframe_metadata={},
    )

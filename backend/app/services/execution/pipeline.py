from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import RuntimeSettings
from app.models.entities import DatasetRecord, ExecutionRecord
from app.schemas.executions import ExecutionRequest, ExecutionResponse
from app.services.logbook import log_book


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
            return ExecutionPayload(
                status="failed",
                schema=[],
                rows=[],
                logs=["No SQL command provided."],
                warnings=[],
                error="Command cannot be empty",
                statistics={},
                dataframe_metadata={},
            )

        dataset = self._pick_dataset(plan)
        if dataset is None:
            return ExecutionPayload(
                status="completed",
                schema=[],
                rows=[],
                logs=["SQL executed with no dataset context."],
                warnings=["No dataset was selected; returning an empty result set."],
                error=None,
                statistics={"engine": "spark_sql", "mode": "mock"},
                dataframe_metadata={},
            )

        rows = plan.context.get("dataset_previews", {}).get(dataset.id, [])[: plan.limit]
        schema = plan.context.get("dataset_schemas", {}).get(dataset.id, [])
        return ExecutionPayload(
            status="completed",
            schema=schema,
            rows=rows,
            logs=[
                f"Parsed Spark SQL command for dataset `{dataset.name}`.",
                "Execution routed through SparkSqlExecutor.",
            ],
            warnings=["Running in mock execution mode until live Spark execution is enabled."],
            error=None,
            statistics={"engine": "spark_sql", "dataset": dataset.name, "returnedRows": len(rows)},
            dataframe_metadata={"normalized": True},
        )

    @staticmethod
    def _pick_dataset(plan: ExecutionPlan) -> DatasetRecord | None:
        if not plan.datasets:
            return None
        lowered = plan.command.lower()
        for dataset in plan.datasets:
            if dataset.name.lower() in lowered:
                return dataset
        return plan.datasets[0]


class SparkDataFrameExecutor:
    async def execute(self, plan: ExecutionPlan) -> ExecutionPayload:
        dataset = plan.datasets[0] if plan.datasets else None
        schema = plan.context.get("dataset_schemas", {}).get(dataset.id, []) if dataset else []
        rows = plan.context.get("dataset_previews", {}).get(dataset.id, [])[: plan.limit] if dataset else []
        return ExecutionPayload(
            status="completed",
            schema=schema,
            rows=rows,
            logs=[
                "Execution routed through SparkDataFrameExecutor.",
                "DataFrame commands are normalized into the shared response contract.",
            ],
            warnings=["DataFrame execution is currently simulated for local-first development."],
            error=None,
            statistics={"engine": "spark_dataframe", "datasetBound": bool(dataset)},
            dataframe_metadata={"api": "pyspark", "previewOnly": True, "command": plan.command},
        )


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
        datasets = await self._load_datasets(session, request.dataset_ids)
        preview_context = await self._build_dataset_context(datasets)
        plan = ExecutionPlan(
            engine=parsed.engine,
            command=parsed.command,
            datasets=datasets,
            datasource_id=request.datasource_id,
            limit=request.limit or self.settings.execution.default_limit,
            execution_mode=parsed.execution_mode,
            context={**parsed.context, **preview_context},
        )
        log_book.add("execution", "info", f"Executing {request.engine} command in {request.execution_mode} mode")
        payload = await self.registry.get_executor(request.engine).execute(plan)
        duration_ms = int((time.perf_counter() - started) * 1000)

        record = ExecutionRecord(
            engine=request.engine,
            dataset_id=request.dataset_ids[0] if request.dataset_ids else None,
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
        )

    async def history(self, session: AsyncSession) -> list[ExecutionRecord]:
        return (await session.execute(select(ExecutionRecord).order_by(ExecutionRecord.created_at.desc()))).scalars().all()

    async def get_execution(self, session: AsyncSession, execution_id: str) -> ExecutionRecord | None:
        return await session.get(ExecutionRecord, execution_id)

    async def _load_datasets(self, session: AsyncSession, dataset_ids: list[str]) -> list[DatasetRecord]:
        if not dataset_ids:
            return []
        rows = (await session.execute(select(DatasetRecord).where(DatasetRecord.id.in_(dataset_ids)))).scalars().all()
        return list(rows)

    async def _build_dataset_context(self, datasets: list[DatasetRecord]) -> dict[str, Any]:
        from app.services.storage.datasets import DatasetFileService
        from app.core.config import get_settings

        file_service = DatasetFileService(get_settings())
        previews: dict[str, list[dict]] = {}
        schemas: dict[str, list[dict]] = {}
        for dataset in datasets:
            rows, schema, _ = file_service.read_preview(dataset.location, limit=self.settings.execution.default_limit)
            previews[dataset.id] = rows
            schemas[dataset.id] = schema
        return {"dataset_previews": previews, "dataset_schemas": schemas}


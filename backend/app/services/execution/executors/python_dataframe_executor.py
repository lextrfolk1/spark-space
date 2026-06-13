"""
Python DataFrame Executor — handles PYTHON_DATAFRAME cell type execution.
Routes execution to Spark Connect or falls back to local Pandas dataframe evaluator.
"""
from __future__ import annotations

import logging
import asyncio
import time
from typing import Any

from app.schemas.notebooks import CellExecuteRequest, CellExecuteResponse
from app.services.execution.base import (
    ExecutionPlanV2,
    Executor,
    RawResult,
    ValidationResult,
)
from app.services.execution.router import ExecutionRouter
from app.core.config import get_settings

logger = logging.getLogger(__name__)


class PythonDataFrameExecutor(Executor):
    """
    Executor for Python DataFrame query cells.
    Parses and runs DataFrame commands (e.g. select, filter, limit) on datasets.
    """

    async def validate(self, request: CellExecuteRequest) -> ValidationResult:
        import ast
        content = request.content.strip()
        if not content:
            return ValidationResult(
                valid=False,
                errors=["DataFrame command cannot be empty."],
            )

        try:
            ast.parse(content, mode="exec")
        except SyntaxError as e:
            return ValidationResult(
                valid=False,
                errors=[f"Invalid Python syntax: {e}"],
            )

        return ValidationResult(valid=True, normalized_content=content)

    async def plan(self, request: CellExecuteRequest, **kwargs: Any) -> ExecutionPlanV2:
        session = kwargs.get("session")
        context = request.context

        datasource_id = context.get("connectionId")
        datasource = None
        
        settings = get_settings()

        # Resolve connection
        if datasource_id:
            datasource = next(
                (item for item in settings.datasource.configured_connections if item.id == datasource_id),
                None,
            )
            if not datasource and session:
                from app.models.entities import DatasourceRecord
                datasource = await session.get(DatasourceRecord, datasource_id)

        connection_config = {}
        if datasource:
            if hasattr(datasource, "encrypted_password") and isinstance(datasource.encrypted_password, (str, bytes)):
                from app.services.execution.pipeline import CredentialCipher
                cipher = CredentialCipher(settings.app_credential_key)
                password = cipher.decrypt(datasource.encrypted_password) if datasource.encrypted_password else ""
                connection_config = {
                    "host": datasource.host,
                    "port": datasource.port,
                    "username": datasource.username,
                    "password": password,
                    "database": datasource.database,
                    "schema_name": datasource.schema_name,
                }
            else:
                connection_config = {
                    "host": datasource.host,
                    "port": datasource.port,
                    "username": getattr(datasource, "username", None),
                    "password": getattr(datasource, "password", ""),
                    "database": datasource.database,
                    "schema_name": datasource.schema_name,
                }

        # Resolve local datasets
        all_datasets = []
        if session:
            from app.models.entities import DatasetRecord
            from sqlalchemy import select
            
            stmt = select(DatasetRecord)
            result = await session.execute(stmt)
            all_datasets = result.scalars().all()

        # Detect referenced datasets
        referenced_datasets = ExecutionRouter.detect_referenced_datasets(request.content, all_datasets)

        # Load dataframes for referenced datasets
        dataset_frames = dict(context.get("dataset_frames", {}))
        plan_warnings = []
        
        from app.services.storage.datasets import DatasetFileService
        file_service = DatasetFileService(settings)

        for dataset in referenced_datasets:
            if dataset.id in dataset_frames or dataset.name in dataset_frames:
                continue
            metadata = dataset.metadata_json or {}
            try:
                frame = file_service.load_dataframe(
                    dataset.location,
                    limit=settings.execution.max_rows,
                    delimiter=metadata.get("delimiter", ","),
                    has_header=metadata.get("has_header", True),
                )
                dataset_frames[dataset.id] = frame
                dataset_frames[dataset.name] = frame
            except Exception as e:
                logger.error(f"Failed to load dataset {dataset.name}: {e}", exc_info=True)
                plan_warnings.append(f"Failed to load dataset '{dataset.name}': {e}")

        # Decide routing strategy
        routed_engine = ExecutionRouter.route_execution(
            cell_type=request.cell_type,
            command=request.content,
            datasource=datasource,
            datasets_referenced=referenced_datasets,
            context=context
        )

        return ExecutionPlanV2(
            engine=routed_engine,
            command=request.content.strip(),
            cell_type=request.cell_type,
            input_type=request.input_type,
            datasets=referenced_datasets,
            datasource=datasource,
            connection_config=connection_config,
            limit=context.get("limit", 100),
            context={
                **context,
                "dataset_frames": dataset_frames,
                "warnings": plan_warnings,
            },
        )

    async def execute(self, plan: ExecutionPlanV2) -> RawResult:
        from app.services.execution.adapters import AdapterRegistry
        
        settings = get_settings()

        # Setup config dict for the adapter
        config = {
            "datasets": plan.datasets,
            "dataset_frames": plan.context.get("dataset_frames", {}),
        }

        # Check if Spark connection is required/selected
        if plan.engine == "spark_dataframe" or (plan.datasource and plan.datasource.type.upper() in {"SPARK", "SPARK_SQL"}):
            datasource_type = "SPARK"
            # If a postgres connection exists, pass it down as postgres_config for cross-source join in Spark
            if plan.datasource and plan.datasource.type.upper() in {"POSTGRESQL", "POSTGRES"}:
                config["postgres_config"] = plan.connection_config
            
            # Setup Spark Connect parameters
            if plan.datasource and plan.datasource.type.upper() in {"SPARK", "SPARK_SQL"}:
                config["host"] = plan.connection_config.get("host")
                config["port"] = plan.connection_config.get("port")
            else:
                # Local Spark fallback config
                spark_local = next(
                    (item for item in settings.datasource.configured_connections if item.id == "spark_local"),
                    None,
                )
                config["host"] = spark_local.host if spark_local else "spark"
                config["port"] = spark_local.port if spark_local else 15002
        else:
            # Local execution (Pandas) fallback
            datasource_type = "SQLITE"

        registry = AdapterRegistry()
        adapter = registry.get_adapter(datasource_type)
        plan_warnings = plan.context.get("warnings", [])

        # Timeout handling
        timeout_ms = plan.context.get("timeout_ms") or settings.execution.timeout_ms
        timeout_seconds = timeout_ms / 1000.0

        try:
            await adapter.connect(config)
            # Run DataFrame execution on the adapter with a timeout
            result = await asyncio.wait_for(
                adapter.execute_dataframe(plan.command, plan.limit),
                timeout=timeout_seconds
            )
            if plan_warnings:
                result.warnings = list(set(result.warnings + plan_warnings))
            result.statistics["dataset_ids"] = [ds.id for ds in plan.datasets]
            return result
        except asyncio.TimeoutError:
            logger.error(f"DataFrame execution timed out after {timeout_seconds}s (limit: {timeout_ms}ms)")
            
            # If Spark timed out, attempt to fallback to local Pandas execution
            if datasource_type == "SPARK":
                logger.info("Falling back to local Pandas execution after Spark Connect timeout.")
                try:
                    fallback_adapter = registry.get_adapter("SQLITE")
                    await fallback_adapter.connect(config)
                    result = await fallback_adapter.execute_dataframe(plan.command, plan.limit)
                    result.logs = [
                        "Warning: Spark Connect execution timed out.",
                        f"Execution fell back to local Pandas mode."
                    ] + result.logs
                    if plan_warnings:
                        result.warnings = list(set(result.warnings + plan_warnings))
                    result.statistics["dataset_ids"] = [ds.id for ds in plan.datasets]
                    return result
                except Exception as fallback_exc:
                    logger.error(f"Local Pandas fallback execution failed after Spark timeout: {fallback_exc}")

            res = RawResult(
                status="failed",
                error=f"DataFrame execution timed out after {timeout_seconds} seconds.",
                logs=[f"Execution exceeded timeout limit of {timeout_seconds}s."],
                warnings=plan_warnings,
            )
            res.statistics["dataset_ids"] = [ds.id for ds in plan.datasets]
            return res
        except Exception as e:
            logger.error(f"DataFrame execution failed: {e}", exc_info=True)
            
            # Fallback to local Pandas evaluation if Spark Connect failed to connect/execute
            if datasource_type == "SPARK":
                logger.info(f"Spark Connect execution failed: {e}. Falling back to local Pandas mode.")
                try:
                    fallback_adapter = registry.get_adapter("SQLITE")
                    await fallback_adapter.connect(config)
                    result = await fallback_adapter.execute_dataframe(plan.command, plan.limit)
                    result.logs = [
                        f"Warning: Spark Connect connection failed ({e}).",
                        "Execution fell back to local Pandas mode."
                    ] + result.logs
                    if plan_warnings:
                        result.warnings = list(set(result.warnings + plan_warnings))
                    result.statistics["dataset_ids"] = [ds.id for ds in plan.datasets]
                    return result
                except Exception as fallback_exc:
                    logger.error(f"Local Pandas fallback execution failed: {fallback_exc}")

            res = RawResult(status="failed", error=str(e), warnings=plan_warnings)
            res.statistics["dataset_ids"] = [ds.id for ds in plan.datasets]
            return res
        finally:
            await adapter.disconnect()

    async def format_response(
        self, result: RawResult, request: CellExecuteRequest
    ) -> CellExecuteResponse:
        # Determine duration
        duration_ms = result.statistics.get("durationMs", 0)
        
        # Build structured error object if failed
        formatted_error = None
        if result.status == "failed" or result.error:
            formatted_error = {
                "code": "DATAFRAME_EXECUTION_ERROR",
                "message": result.error or "Unknown DataFrame execution error occurred.",
                "details": "; ".join(result.logs) if result.logs else "",
                "hint": "Ensure the DataFrame command is valid Python and references a loaded dataset."
            }

        return CellExecuteResponse(
            success=result.status == "completed",
            execution_id="",
            cell_id=request.context.get("cellId"),
            mode=request.cell_type,
            status="SUCCESS" if result.status == "completed" else "FAILED",
            execution_type=request.cell_type,
            result_type=result.result_type,
            columns=result.columns,
            schema=result.schema,
            rows=result.rows,
            row_count=len(result.rows),
            metadata=result.statistics,
            logs=result.logs,
            warnings=result.warnings,
            error=formatted_error if formatted_error else None,
            duration_ms=duration_ms,
            truncated=result.truncated,
            dataset_ids=result.statistics.get("dataset_ids", []),
        )

"""
Python DataFrame Executor — handles PYTHON_DATAFRAME cell type execution.

Delegates execution to SparkDataFrameExecutor from the pipeline module
while implementing the new 4-phase Executor interface.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path
from typing import Any
import logging

from app.schemas.notebooks import CellExecuteRequest, CellExecuteResponse
from app.services.execution.base import (
    ExecutionPlanV2,
    Executor,
    RawResult,
    ValidationResult,
)

logger = logging.getLogger(__name__)


class PythonDataFrameExecutor(Executor):
    """
    Executor for Python DataFrame query cells.
    Parses and runs DataFrame commands (e.g. select, filter, limit) on uploaded datasets.
    """

    async def validate(self, request: CellExecuteRequest) -> ValidationResult:
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

        # Load all datasets and detect references in request.content
        datasets = []
        dataset_frames = {}
        plan_warnings = []

        if session:
            from app.models.entities import DatasetRecord
            from sqlalchemy import select

            stmt = select(DatasetRecord)
            result = await session.execute(stmt)
            all_datasets = result.scalars().all()

            # Start with context datasetIds if any
            detected_dataset_ids = list(context.get("datasetIds", []))

            # Scan command for dataset names
            for ds in all_datasets:
                clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", ds.name)
                stem_name = Path(ds.name).stem
                clean_stem = re.sub(r"[^a-zA-Z0-9_]", "_", stem_name)

                names_to_check = {
                    ds.name,
                    clean_name,
                    stem_name,
                    clean_stem,
                    ds.name.lower(),
                    clean_name.lower(),
                    stem_name.lower(),
                    clean_stem.lower(),
                }

                matched = False
                for name in names_to_check:
                    if not name:
                        continue
                    pattern = re.compile(rf"\b{re.escape(name)}\b", re.IGNORECASE)
                    if pattern.search(request.content):
                        matched = True
                        break

                if matched and ds.id not in detected_dataset_ids:
                    detected_dataset_ids.append(ds.id)

            # Load the identified datasets
            if detected_dataset_ids:
                stmt_loaded = select(DatasetRecord).where(DatasetRecord.id.in_(detected_dataset_ids))
                loaded_result = await session.execute(stmt_loaded)
                datasets = list(loaded_result.scalars().all())

            from app.core.config import get_settings
            from app.services.storage.datasets import DatasetFileService

            settings = get_settings()
            file_service = DatasetFileService(settings)

            for dataset in datasets:
                metadata = dataset.metadata_json or {}
                try:
                    frame = file_service.load_dataframe(
                        dataset.location,
                        limit=settings.execution.max_rows,
                        delimiter=metadata.get("delimiter", ","),
                        has_header=metadata.get("has_header", True),
                    )
                    dataset_frames[dataset.id] = frame
                except Exception as e:
                    logger.error(
                        f"Failed to load dataset {dataset.name} from {dataset.location}: {e}",
                        exc_info=True,
                    )
                    plan_warnings.append(f"Failed to load dataset '{dataset.name}': {e}")

        return ExecutionPlanV2(
            engine="spark_dataframe",
            command=request.content.strip(),
            cell_type=request.cell_type,
            input_type=request.input_type,
            datasets=datasets,
            limit=context.get("limit", 100),
            context={
                **context,
                "dataset_frames": dataset_frames,
                "warnings": plan_warnings,
            },
        )

    async def execute(self, plan: ExecutionPlanV2) -> RawResult:
        import asyncio
        import json
        import pandas as pd
        import pyspark.sql
        from pyspark.sql import SparkSession
        import logging
        logger = logging.getLogger(__name__)

        from app.core.config import get_settings
        settings = get_settings()

        datasource = next(
            (item for item in settings.datasource.configured_connections if item.id == "spark_local"),
            None,
        )

        host = datasource.host if datasource else "spark"
        port = datasource.port if datasource else 15002
        remote = f"sc://{host}:{port}"

        try:
            from app.services.execution.pipeline import _get_spark_connect_session
            spark = await asyncio.to_thread(_get_spark_connect_session, remote, {})

            frames = plan.context.get("dataset_frames", {})
            globals_dict = {
                "spark": spark,
                "pyspark": pyspark,
                "pd": pd,
            }
            locals_dict = {}

            for dataset in plan.datasets:
                frame = frames.get(dataset.id)
                if frame is not None:
                    await asyncio.to_thread(self._register_spark_dataset, spark, dataset.name, frame, locals_dict)

            def run_pyspark():
                import ast
                code = plan.command.strip()
                module = ast.parse(code)
                if not module.body:
                    return pd.DataFrame()

                if isinstance(module.body[-1], ast.Expr):
                    if len(module.body) > 1:
                        statements = ast.Module(body=module.body[:-1], type_ignores=[])
                        exec(compile(statements, filename="<string>", mode="exec"), globals_dict, locals_dict)

                    expr = ast.Expression(body=module.body[-1].value)
                    result = eval(compile(expr, filename="<string>", mode="eval"), globals_dict, locals_dict)
                else:
                    exec(compile(module, filename="<string>", mode="exec"), globals_dict, locals_dict)
                    result = None
                    for val in reversed(list(locals_dict.values())):
                        if isinstance(val, pyspark.sql.DataFrame):
                            result = val
                            break

                if isinstance(result, pyspark.sql.DataFrame):
                    df_limited = result.limit(plan.limit)
                    pandas_frame = df_limited.toPandas()
                    if pandas_frame.empty:
                        pandas_frame = pd.DataFrame(columns=df_limited.columns)
                    return pandas_frame
                elif isinstance(result, pd.DataFrame):
                    return result.head(plan.limit)
                elif result is None:
                    raise ValueError("The code did not return a Spark DataFrame or Pandas DataFrame.")
                else:
                    raise ValueError(f"Expected a DataFrame, but got {type(result).__name__}")

            result_frame = await asyncio.to_thread(run_pyspark)
            schema = [{"name": name, "type": str(dtype)} for name, dtype in result_frame.dtypes.items()]
            rows = json.loads(result_frame.to_json(orient="records", date_format="iso"))

            return RawResult(
                status="completed",
                columns=list(result_frame.columns),
                schema=schema,
                rows=rows,
                logs=[
                    "Execution routed through PySpark execution engine.",
                    "Spark Session `spark` is available in context.",
                    f"Connected to remote Spark Connect server: {remote}"
                ],
                statistics={
                    "engine": "spark_dataframe",
                    "mode": "spark_connect",
                    "returnedRows": len(rows),
                }
            )

        except Exception as exc:
            logger.warning(f"Spark Connect execution failed: {exc}. Falling back to local Pandas parser.", exc_info=True)
            from app.services.execution.pipeline import (
                ExecutionPlan as LegacyExecutionPlan,
                SparkDataFrameExecutor,
            )

            legacy_plan = LegacyExecutionPlan(
                engine=plan.engine,
                command=plan.command,
                datasets=plan.datasets,
                datasource_id=None,
                datasource=None,
                limit=plan.limit,
                execution_mode="local",
                context=plan.context,
            )

            executor = SparkDataFrameExecutor()
            payload = await executor.execute(legacy_plan)

            if payload.status == "failed":
                return RawResult(
                    status="failed",
                    error=payload.error,
                    warnings=payload.warnings,
                    logs=payload.logs,
                )

            return RawResult(
                status="completed",
                columns=[col["name"] for col in payload.schema],
                schema=payload.schema,
                rows=payload.rows,
                logs=[
                    f"Warning: Spark Connect connection failed ({exc}). Execution fell back to local Pandas mode.",
                ] + payload.logs,
                warnings=payload.warnings,
                statistics={
                    **payload.statistics,
                    "dataframe_metadata": payload.dataframe_metadata,
                },
            )

    def _register_spark_dataset(self, spark: SparkSession, name: str, frame: pd.DataFrame, locals_dict: dict) -> None:
        import re
        clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', name)
        try:
            spark_df = spark.createDataFrame(frame)
            spark_df.createOrReplaceTempView(clean_name)
            locals_dict[clean_name] = spark_df
            if clean_name != name:
                spark_df.createOrReplaceTempView(name)
                locals_dict[name] = spark_df
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to register Spark view for {name}: {e}")

    async def format_response(
        self, result: RawResult, request: CellExecuteRequest
    ) -> CellExecuteResponse:
        return CellExecuteResponse(
            execution_id="",
            status="SUCCESS" if result.status == "completed" else "FAILED",
            execution_type="PYTHON_DATAFRAME",
            result_type=result.result_type,
            columns=result.columns,
            schema=result.schema,
            rows=result.rows,
            row_count=len(result.rows),
            metadata=result.statistics,
            logs=result.logs,
            warnings=result.warnings,
            error=result.error,
        )

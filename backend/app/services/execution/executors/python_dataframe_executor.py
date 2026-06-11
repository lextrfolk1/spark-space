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
            logs=payload.logs,
            warnings=payload.warnings,
            statistics={
                **payload.statistics,
                "dataframe_metadata": payload.dataframe_metadata,
            },
        )

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

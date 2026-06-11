"""
Dataset Preview Executor — handles Data Preview cell type execution.

Loads a registered dataset and returns its schema and first N rows
for preview inside the notebook.
"""
from __future__ import annotations

from typing import Any

from app.schemas.notebooks import CellExecuteRequest, CellExecuteResponse
from app.services.execution.base import (
    ExecutionPlanV2,
    Executor,
    RawResult,
    ValidationResult,
)


class DatasetPreviewExecutor(Executor):
    """
    Executor for Data Preview cell types.
    Loads a dataset and returns schema + preview rows.
    """

    async def validate(self, request: CellExecuteRequest) -> ValidationResult:
        dataset = request.context.get("dataset")
        if not dataset:
            return ValidationResult(
                valid=False,
                errors=["No dataset specified for preview. Select a dataset in the cell context."],
            )
        return ValidationResult(valid=True)

    async def plan(self, request: CellExecuteRequest, **kwargs: Any) -> ExecutionPlanV2:
        session = kwargs.get("session")
        dataset_id = request.context.get("dataset")
        
        schema = []
        rows = []
        error = None
        
        if dataset_id and session:
            from app.models.entities import DatasetRecord
            dataset = await session.get(DatasetRecord, dataset_id)
            if dataset:
                from app.core.config import get_settings
                from app.services.storage.datasets import DatasetFileService
                
                settings = get_settings()
                file_service = DatasetFileService(settings)
                
                try:
                    metadata = dataset.metadata_json or {}
                    frame = file_service.load_dataframe(
                        dataset.location,
                        limit=request.context.get("limit", 100),
                        delimiter=metadata.get("delimiter", ","),
                        has_header=metadata.get("has_header", True),
                    )
                    schema = [{"name": name, "type": str(dtype)} for name, dtype in frame.dtypes.items()]
                    import json
                    rows = json.loads(frame.to_json(orient="records", date_format="iso"))
                except Exception as e:
                    error = str(e)
                    
        return ExecutionPlanV2(
            engine="dataset_preview",
            command=f"PREVIEW {dataset_id}",
            cell_type="DATA_PREVIEW",
            input_type="DATASET_PREVIEW",
            limit=request.context.get("limit", 100),
            context={
                **request.context,
                "rows": rows,
                "schema": schema,
                "error": error,
            },
        )

    async def execute(self, plan: ExecutionPlanV2) -> RawResult:
        error = plan.context.get("error")
        if error:
            return RawResult(status="failed", error=error)
            
        return RawResult(
            status="completed",
            columns=[col["name"] for col in plan.context.get("schema", [])],
            schema=plan.context.get("schema", []),
            rows=plan.context.get("rows", []),
            logs=[f"Dataset preview completed for: {plan.context.get('dataset', 'unknown')}"],
            result_type="TABLE",
        )

    async def format_response(self, result: RawResult, request: CellExecuteRequest) -> CellExecuteResponse:
        return CellExecuteResponse(
            execution_id="",
            status="SUCCESS" if result.status == "completed" else "FAILED",
            execution_type="DATA_PREVIEW",
            result_type=result.result_type,
            columns=result.columns,
            schema=result.schema,
            rows=result.rows,
            row_count=len(result.rows),
            metadata={
                "dataset": request.context.get("dataset"),
                **result.statistics,
            },
            logs=result.logs,
            warnings=result.warnings,
            error=result.error,
        )

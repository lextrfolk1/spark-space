"""
Markdown Executor — handles Markdown cell type execution.

Validates and renders markdown content. Demonstrates the executor
pattern with a non-SQL cell type.
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


class MarkdownExecutor(Executor):
    """
    Executor for Markdown cell types.
    Validates markdown content and returns it as rendered text.
    """

    async def validate(self, request: CellExecuteRequest) -> ValidationResult:
        if not request.content.strip():
            return ValidationResult(
                valid=True,
                warnings=["Empty markdown cell."],
                normalized_content="",
            )
        return ValidationResult(valid=True, normalized_content=request.content)

    async def plan(self, request: CellExecuteRequest, **kwargs: Any) -> ExecutionPlanV2:
        return ExecutionPlanV2(
            engine="markdown",
            command=request.content,
            cell_type="MARKDOWN",
            input_type="MARKDOWN_TEXT",
        )

    async def execute(self, plan: ExecutionPlanV2) -> RawResult:
        return RawResult(
            status="completed",
            logs=["Markdown rendered successfully."],
            result_type="TEXT",
        )

    async def format_response(self, result: RawResult, request: CellExecuteRequest) -> CellExecuteResponse:
        return CellExecuteResponse(
            execution_id="",
            status="SUCCESS",
            execution_type="MARKDOWN",
            result_type="TEXT",
            metadata={"rendered": True, "contentLength": len(request.content)},
            logs=result.logs,
        )

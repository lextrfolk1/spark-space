from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db_session
from app.schemas.executions import ExecutionHistoryItem, ExecutionRequest, ExecutionResponse
from app.services.execution.pipeline import ExecutionService
from app.services.logbook import log_book

router = APIRouter()


@router.post("/execute", response_model=ExecutionResponse)
async def execute_command(
    payload: ExecutionRequest,
    session: AsyncSession = Depends(get_db_session),
) -> ExecutionResponse:
    service = ExecutionService(get_settings())
    result = await service.execute(session, payload)
    log_book.add("execution", "info", f"Execution completed with status {result.status}")
    return result


@router.get("/executions/history", response_model=list[ExecutionHistoryItem])
async def execution_history(session: AsyncSession = Depends(get_db_session)) -> list[ExecutionHistoryItem]:
    service = ExecutionService(get_settings())
    history = await service.history(session)
    return [
        ExecutionHistoryItem(
            id=item.id,
            engine=item.engine,
            dataset_id=item.dataset_id,
            datasource_id=item.datasource_id,
            user_name=item.user_name,
            command=item.command,
            status=item.status,
            duration_ms=item.duration_ms,
            created_at=item.created_at,
        )
        for item in history
    ]


@router.get("/executions/{execution_id}", response_model=ExecutionResponse)
async def get_execution(execution_id: str, session: AsyncSession = Depends(get_db_session)) -> ExecutionResponse:
    service = ExecutionService(get_settings())
    record = await service.get_execution(session, execution_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Execution not found")
    return ExecutionResponse(
        execution_id=record.id,
        status=record.status,
        schema=record.schema_json or [],
        rows=record.rows_json or [],
        row_count=len(record.rows_json or []),
        dataframe_metadata={},
        logs=record.logs_json or [],
        warnings=record.warnings_json or [],
        error=record.error_message,
        execution_time_ms=record.duration_ms,
        statistics=record.statistics_json or {},
    )


@router.post("/executions/{execution_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
async def cancel_execution(execution_id: str) -> dict[str, str]:
    log_book.add("execution", "warning", f"Cancellation requested for execution {execution_id}")
    return {"status": "accepted", "message": "Cancellation has been queued."}

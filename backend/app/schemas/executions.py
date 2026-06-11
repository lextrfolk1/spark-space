from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ExecutionRequest(BaseModel):
    engine: str
    datasource_id: str | None = None
    dataset_ids: list[str] = Field(default_factory=list)
    command: str
    execution_mode: str = "current_cell"
    timeout_ms: int | None = None
    limit: int | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class ExecutionResponse(BaseModel):
    execution_id: str
    status: str
    result_type: str = "TABLE"
    generated_query: str | None = None
    schema: list[dict[str, Any]] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    row_count: int = 0
    dataframe_metadata: dict[str, Any] = Field(default_factory=dict)
    logs: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None
    execution_time_ms: int
    statistics: dict[str, Any] = Field(default_factory=dict)
    dataset_ids: list[str] = Field(default_factory=list)


class ExecutionHistoryItem(BaseModel):
    id: str
    engine: str
    dataset_id: str | None = None
    datasource_id: str | None = None
    user_name: str
    command: str
    status: str
    duration_ms: int
    created_at: datetime


from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Notebook
# ---------------------------------------------------------------------------

class NotebookCreate(BaseModel):
    name: str
    description: str | None = None


class NotebookUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_archived: bool | None = None


class NotebookListItem(BaseModel):
    id: str
    name: str
    description: str | None = None
    is_archived: bool
    cell_count: int = 0
    created_at: datetime
    updated_at: datetime


class NotebookResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    is_archived: bool
    sections: list[SectionResponse] = Field(default_factory=list)
    cells: list[CellResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Section
# ---------------------------------------------------------------------------

class SectionCreate(BaseModel):
    title: str = "Untitled Section"
    order: int | None = None


class SectionUpdate(BaseModel):
    title: str | None = None
    order: int | None = None
    collapsed: bool | None = None


class SectionResponse(BaseModel):
    id: str
    notebook_id: str
    title: str
    order: int
    collapsed: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Cell
# ---------------------------------------------------------------------------

class CellCreate(BaseModel):
    cell_type: str = "SQL"
    input_type: str = "STRUCTURED_QUERY"
    content: str = ""
    engine: str = "spark_sql"
    section_id: str | None = None
    order: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class CellUpdate(BaseModel):
    cell_type: str | None = None
    input_type: str | None = None
    content: str | None = None
    engine: str | None = None
    section_id: str | None = None
    order: int | None = None
    status: str | None = None
    metadata: dict[str, Any] | None = None


class CellResponse(BaseModel):
    id: str
    notebook_id: str
    section_id: str | None = None
    cell_type: str
    input_type: str
    content: str
    engine: str
    order: int
    status: str
    last_result: dict[str, Any] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Cell Execution DTO — the core contract
# ---------------------------------------------------------------------------

class CellExecuteRequest(BaseModel):
    """
    The structured request sent to execute a notebook cell.
    Today cellType may be SQL; tomorrow it may be NATURAL_LANGUAGE,
    SPARK_SQL, DATAFRAME, RULE_ENGINE, LLM_PROMPT, etc.
    The backend decides how to route and execute based on these fields.
    """
    cell_type: str = Field(alias="cellType", default="SQL")
    input_type: str = Field(alias="inputType", default="STRUCTURED_QUERY")
    content: str
    context: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class CellExecuteResponse(BaseModel):
    """
    Structured response from cell execution.
    Includes resultType so the frontend knows which renderer to use.
    """
    execution_id: str
    status: str
    execution_type: str
    result_type: str = "TABLE"
    generated_query: str | None = None
    columns: list[str] = Field(default_factory=list)
    schema: list[dict[str, Any]] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    row_count: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)
    logs: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    error: Any = None
    success: bool = True
    cell_id: str | None = None
    mode: str | None = None
    duration_ms: int = 0
    truncated: bool = False
    dataset_ids: list[str] = Field(default_factory=list)


# Forward reference resolution
NotebookResponse.model_rebuild()

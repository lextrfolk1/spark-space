from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db_session
from app.models.entities import (
    CellRecord,
    ExecutionRecord,
    NotebookRecord,
    NotebookSectionRecord,
)
from app.schemas.notebooks import (
    CellCreate,
    CellExecuteRequest,
    CellExecuteResponse,
    CellResponse,
    CellUpdate,
    NotebookCreate,
    NotebookListItem,
    NotebookResponse,
    NotebookUpdate,
    SectionCreate,
    SectionResponse,
    SectionUpdate,
)
from app.services.execution.pipeline import ExecutionService
from app.services.logbook import log_book

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cell_response(cell: CellRecord) -> CellResponse:
    return CellResponse(
        id=cell.id,
        notebook_id=cell.notebook_id,
        section_id=cell.section_id,
        cell_type=cell.cell_type,
        input_type=cell.input_type,
        content=cell.content,
        engine=cell.engine,
        order=cell.order,
        status=cell.status,
        last_result=cell.last_result_json,
        metadata=cell.metadata_json or {},
        created_at=cell.created_at,
        updated_at=cell.updated_at,
    )


def _section_response(section: NotebookSectionRecord) -> SectionResponse:
    return SectionResponse(
        id=section.id,
        notebook_id=section.notebook_id,
        title=section.title,
        order=section.order,
        collapsed=section.collapsed,
        created_at=section.created_at,
        updated_at=section.updated_at,
    )


# ---------------------------------------------------------------------------
# Notebook CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=NotebookResponse, status_code=status.HTTP_201_CREATED)
async def create_notebook(
    payload: NotebookCreate,
    session: AsyncSession = Depends(get_db_session),
) -> NotebookResponse:
    notebook = NotebookRecord(name=payload.name, description=payload.description)
    session.add(notebook)
    await session.commit()
    await session.refresh(notebook)
    log_book.add("notebook", "info", f"Created notebook '{notebook.name}'")
    return NotebookResponse(
        id=notebook.id,
        name=notebook.name,
        description=notebook.description,
        is_archived=notebook.is_archived,
        sections=[],
        cells=[],
        created_at=notebook.created_at,
        updated_at=notebook.updated_at,
    )


@router.get("", response_model=list[NotebookListItem])
async def list_notebooks(
    session: AsyncSession = Depends(get_db_session),
) -> list[NotebookListItem]:
    stmt = select(NotebookRecord).order_by(NotebookRecord.updated_at.desc())
    result = await session.execute(stmt)
    notebooks = result.scalars().all()

    # Fetch cell counts
    count_stmt = (
        select(CellRecord.notebook_id, func.count(CellRecord.id))
        .group_by(CellRecord.notebook_id)
    )
    count_result = await session.execute(count_stmt)
    counts = dict(count_result.all())

    return [
        NotebookListItem(
            id=nb.id,
            name=nb.name,
            description=nb.description,
            is_archived=nb.is_archived,
            cell_count=counts.get(nb.id, 0),
            created_at=nb.created_at,
            updated_at=nb.updated_at,
        )
        for nb in notebooks
    ]


@router.get("/{notebook_id}", response_model=NotebookResponse)
async def get_notebook(
    notebook_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> NotebookResponse:
    notebook = await session.get(NotebookRecord, notebook_id)
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")

    sections_result = await session.execute(
        select(NotebookSectionRecord)
        .where(NotebookSectionRecord.notebook_id == notebook_id)
        .order_by(NotebookSectionRecord.order)
    )
    sections = sections_result.scalars().all()

    cells_result = await session.execute(
        select(CellRecord)
        .where(CellRecord.notebook_id == notebook_id)
        .order_by(CellRecord.order)
    )
    cells = cells_result.scalars().all()

    return NotebookResponse(
        id=notebook.id,
        name=notebook.name,
        description=notebook.description,
        is_archived=notebook.is_archived,
        sections=[_section_response(s) for s in sections],
        cells=[_cell_response(c) for c in cells],
        created_at=notebook.created_at,
        updated_at=notebook.updated_at,
    )


@router.put("/{notebook_id}", response_model=NotebookResponse)
async def update_notebook(
    notebook_id: str,
    payload: NotebookUpdate,
    session: AsyncSession = Depends(get_db_session),
) -> NotebookResponse:
    notebook = await session.get(NotebookRecord, notebook_id)
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if payload.name is not None:
        notebook.name = payload.name
    if payload.description is not None:
        notebook.description = payload.description
    if payload.is_archived is not None:
        notebook.is_archived = payload.is_archived

    await session.commit()
    await session.refresh(notebook)
    return await get_notebook(notebook_id, session)


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notebook(
    notebook_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    notebook = await session.get(NotebookRecord, notebook_id)
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")

    # Delete cells, sections, then notebook
    await session.execute(
        select(CellRecord).where(CellRecord.notebook_id == notebook_id).execution_options(synchronize_session="fetch")
    )
    cells = (await session.execute(select(CellRecord).where(CellRecord.notebook_id == notebook_id))).scalars().all()
    for cell in cells:
        await session.delete(cell)

    sections = (await session.execute(select(NotebookSectionRecord).where(NotebookSectionRecord.notebook_id == notebook_id))).scalars().all()
    for section in sections:
        await session.delete(section)

    await session.delete(notebook)
    await session.commit()
    log_book.add("notebook", "info", f"Deleted notebook {notebook_id}")


# ---------------------------------------------------------------------------
# Section CRUD
# ---------------------------------------------------------------------------

@router.post("/{notebook_id}/sections", response_model=SectionResponse, status_code=status.HTTP_201_CREATED)
async def create_section(
    notebook_id: str,
    payload: SectionCreate,
    session: AsyncSession = Depends(get_db_session),
) -> SectionResponse:
    notebook = await session.get(NotebookRecord, notebook_id)
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")

    # Auto-assign order if not provided
    order = payload.order
    if order is None:
        max_order_result = await session.execute(
            select(func.coalesce(func.max(NotebookSectionRecord.order), -1))
            .where(NotebookSectionRecord.notebook_id == notebook_id)
        )
        order = max_order_result.scalar() + 1

    section = NotebookSectionRecord(
        notebook_id=notebook_id,
        title=payload.title,
        order=order,
    )
    session.add(section)
    await session.commit()
    await session.refresh(section)
    return _section_response(section)


@router.put("/{notebook_id}/sections/{section_id}", response_model=SectionResponse)
async def update_section(
    notebook_id: str,
    section_id: str,
    payload: SectionUpdate,
    session: AsyncSession = Depends(get_db_session),
) -> SectionResponse:
    section = await session.get(NotebookSectionRecord, section_id)
    if section is None or section.notebook_id != notebook_id:
        raise HTTPException(status_code=404, detail="Section not found")

    if payload.title is not None:
        section.title = payload.title
    if payload.order is not None:
        section.order = payload.order
    if payload.collapsed is not None:
        section.collapsed = payload.collapsed

    await session.commit()
    await session.refresh(section)
    return _section_response(section)


@router.delete("/{notebook_id}/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_section(
    notebook_id: str,
    section_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    section = await session.get(NotebookSectionRecord, section_id)
    if section is None or section.notebook_id != notebook_id:
        raise HTTPException(status_code=404, detail="Section not found")

    # Unlink cells from this section (move them to unsectioned)
    cells = (await session.execute(
        select(CellRecord).where(CellRecord.section_id == section_id)
    )).scalars().all()
    for cell in cells:
        cell.section_id = None

    await session.delete(section)
    await session.commit()


# ---------------------------------------------------------------------------
# Cell CRUD
# ---------------------------------------------------------------------------

@router.post("/{notebook_id}/cells", response_model=CellResponse, status_code=status.HTTP_201_CREATED)
async def create_cell(
    notebook_id: str,
    payload: CellCreate,
    session: AsyncSession = Depends(get_db_session),
) -> CellResponse:
    notebook = await session.get(NotebookRecord, notebook_id)
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")

    order = payload.order
    if order is None:
        max_order_result = await session.execute(
            select(func.coalesce(func.max(CellRecord.order), -1))
            .where(CellRecord.notebook_id == notebook_id)
        )
        order = max_order_result.scalar() + 1

    cell = CellRecord(
        notebook_id=notebook_id,
        section_id=payload.section_id,
        cell_type=payload.cell_type,
        input_type=payload.input_type,
        content=payload.content,
        engine=payload.engine,
        order=order,
        metadata_json=payload.metadata,
    )
    session.add(cell)
    await session.commit()
    await session.refresh(cell)
    return _cell_response(cell)


@router.put("/{notebook_id}/cells/{cell_id}", response_model=CellResponse)
async def update_cell(
    notebook_id: str,
    cell_id: str,
    payload: CellUpdate,
    session: AsyncSession = Depends(get_db_session),
) -> CellResponse:
    cell = await session.get(CellRecord, cell_id)
    if cell is None or cell.notebook_id != notebook_id:
        raise HTTPException(status_code=404, detail="Cell not found")

    if payload.cell_type is not None:
        cell.cell_type = payload.cell_type
    if payload.input_type is not None:
        cell.input_type = payload.input_type
    if payload.content is not None:
        cell.content = payload.content
    if payload.engine is not None:
        cell.engine = payload.engine
    if payload.section_id is not None:
        cell.section_id = payload.section_id
    if payload.order is not None:
        cell.order = payload.order
    if payload.status is not None:
        cell.status = payload.status
    if payload.metadata is not None:
        cell.metadata_json = payload.metadata

    await session.commit()
    await session.refresh(cell)
    return _cell_response(cell)


@router.delete("/{notebook_id}/cells/{cell_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cell(
    notebook_id: str,
    cell_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    cell = await session.get(CellRecord, cell_id)
    if cell is None or cell.notebook_id != notebook_id:
        raise HTTPException(status_code=404, detail="Cell not found")
    await session.delete(cell)
    await session.commit()


# ---------------------------------------------------------------------------
# Natural Language Parsing Mock API
# ---------------------------------------------------------------------------

from pydantic import BaseModel
import re

class ParseRequest(BaseModel):
    prompt: str
    context: dict[str, Any] = {}

class ParseResponse(BaseModel):
    sql: str
    engine: str = "sqlite"

@router.post("/parse-nl", response_model=ParseResponse)
async def parse_natural_language_prompt(payload: ParseRequest) -> ParseResponse:
    """Simulated Natural Language to SQL translation API."""
    prompt = payload.prompt.lower().strip().rstrip("?;")
    sql = "SELECT * FROM customers_smoke"
    
    if "rule" in prompt:
        sql = "SELECT * FROM rule_type"
    elif "customer" in prompt:
        sql = "SELECT * FROM customers_smoke"
    else:
        # Match simple patterns like "show [table]"
        match = re.search(r'(?:show|get|list|select)\s+(?:me\s+)?(?:all\s+)?([a-zA-Z0-9_/]+)', prompt)
        if match:
            sql = f"SELECT * FROM {match.group(1)}"
            
    return ParseResponse(sql=sql, engine="sqlite")


# ---------------------------------------------------------------------------
# Cell Execution — the core endpoint
# ---------------------------------------------------------------------------

@router.post(
    "/{notebook_id}/cells/{cell_id}/execute",
    response_model=CellExecuteResponse,
)
async def execute_cell(
    notebook_id: str,
    cell_id: str,
    payload: CellExecuteRequest,
    session: AsyncSession = Depends(get_db_session),
) -> CellExecuteResponse:
    cell = await session.get(CellRecord, cell_id)
    if cell is None or cell.notebook_id != notebook_id:
        raise HTTPException(status_code=404, detail="Cell not found")

    # Update cell content and status
    cell.content = payload.content
    cell.cell_type = payload.cell_type
    cell.input_type = payload.input_type
    cell.status = "running"
    await session.commit()

    started = time.perf_counter()
    settings = get_settings()

    # Map cellType → engine for the execution pipeline
    engine = _resolve_engine(payload.cell_type, payload.input_type, payload.context)

    log_book.add(
        "execution", "info",
        f"Executing cell {cell_id} in notebook {notebook_id} via {engine}",
    )

    try:
        from app.services.execution.factory import get_executor_factory
        factory = get_executor_factory()
        executor = factory.get_executor(payload.cell_type, payload.input_type, payload.context)
        
        response = await executor.run(payload, session=session)
        if not response.execution_id:
            response.execution_id = cell.id
    except Exception as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        response = CellExecuteResponse(
            execution_id=cell.id,
            status="FAILED",
            execution_type=payload.cell_type,
            result_type="ERROR",
            error=str(exc),
            metadata={"executionTimeMs": duration_ms},
            logs=[f"Execution failed: {exc}"],
        )

    # Update cell with result
    cell.status = "completed" if response.status == "SUCCESS" else "failed"
    cell.last_result_json = response.model_dump()
    await session.commit()

    return response


def _resolve_engine(cell_type: str, input_type: str, context: dict[str, Any]) -> str:
    """
    Map the DTO cellType/inputType/context to the internal execution engine.
    This is the factory logic — today it's a simple mapping, but can grow
    to support NLP, Spark, DataFrame, Rule Engine, etc.
    """
    engine_from_context = context.get("engine")
    if engine_from_context:
        return engine_from_context

    mapping = {
        "SQL": "spark_sql",
        "SPARK_SQL": "spark_sql",
        "DATAFRAME": "spark_dataframe",
        "PYTHON_DATAFRAME": "spark_dataframe",
        "RULE_ENGINE": "rule_engine",
        "NATURAL_LANGUAGE": "spark_sql",  # Future: route to NLP executor
        "LLM_PROMPT": "spark_sql",  # Future: route to LLM executor
    }
    return mapping.get(cell_type, "spark_sql")

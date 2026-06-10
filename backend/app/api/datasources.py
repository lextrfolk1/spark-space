from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db_session
from app.schemas.datasources import (
    DatasourceCreate,
    DatasourceResponse,
    DatasourceTestRequest,
    DatasourceTestResponse,
    DatasourceUpdate,
)
from app.services.connectors.tester import test_connection
from app.services.datasources import DatasourceService
from app.services.logbook import log_book

router = APIRouter()


@router.get("", response_model=list[DatasourceResponse])
async def list_datasources(session: AsyncSession = Depends(get_db_session)) -> list[DatasourceResponse]:
    service = DatasourceService(get_settings())
    return await service.list_all(session)


@router.post("", response_model=DatasourceResponse, status_code=status.HTTP_201_CREATED)
async def create_datasource(
    payload: DatasourceCreate,
    session: AsyncSession = Depends(get_db_session),
) -> DatasourceResponse:
    settings = get_settings()
    if not settings.datasource.allow_runtime_creation:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Runtime datasource creation is disabled")
    service = DatasourceService(settings)
    datasource = await service.create(session, payload)
    log_book.add("datasource", "info", f"Datasource created: {datasource.name}")
    return datasource


@router.post("/test", response_model=DatasourceTestResponse)
async def test_datasource(payload: DatasourceTestRequest) -> DatasourceTestResponse:
    result = await test_connection(payload)
    log_book.add("datasource", "info" if result.success else "warning", result.message)
    return result


@router.put("/{datasource_id}", response_model=DatasourceResponse)
async def update_datasource(
    datasource_id: str,
    payload: DatasourceUpdate,
    session: AsyncSession = Depends(get_db_session),
) -> DatasourceResponse:
    service = DatasourceService(get_settings())
    datasource = await service.update(session, datasource_id, payload)
    if datasource is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Datasource not found")
    log_book.add("datasource", "info", f"Datasource updated: {datasource.name}")
    return datasource


@router.delete("/{datasource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_datasource(datasource_id: str, session: AsyncSession = Depends(get_db_session)) -> None:
    service = DatasourceService(get_settings())
    await service.delete(session, datasource_id)
    log_book.add("datasource", "info", f"Datasource deleted: {datasource_id}")

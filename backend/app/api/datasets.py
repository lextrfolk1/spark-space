from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db_session
from app.schemas.datasets import (
    DatasetPreviewResponse,
    DatasetRegistrationRequest,
    DatasetResponse,
    UploadResponse,
)
from app.services.catalog import DatasetCatalogService
from app.services.logbook import log_book
from app.services.storage.datasets import DatasetFileService

router = APIRouter()


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(file: UploadFile = File(...)) -> UploadResponse:
    settings = get_settings()
    if not settings.upload.enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Uploads are disabled")
    response = await DatasetFileService(settings).store_upload(file)
    log_book.add("dataset", "info", f"Uploaded file staged as {response.upload_token}")
    return response


@router.post("/register", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def register_dataset(
    payload: DatasetRegistrationRequest,
    session: AsyncSession = Depends(get_db_session),
) -> DatasetResponse:
    service = DatasetCatalogService(DatasetFileService(get_settings()))
    dataset = await service.register(session, payload)
    log_book.add("dataset", "info", f"Registered dataset {dataset.name}")
    return dataset


@router.get("", response_model=list[DatasetResponse])
async def list_datasets(session: AsyncSession = Depends(get_db_session)) -> list[DatasetResponse]:
    service = DatasetCatalogService(DatasetFileService(get_settings()))
    return await service.list_datasets(session)


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(dataset_id: str, session: AsyncSession = Depends(get_db_session)) -> DatasetResponse:
    service = DatasetCatalogService(DatasetFileService(get_settings()))
    dataset = await service.get_dataset(session, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return service._to_schema(dataset)


@router.get("/{dataset_id}/schema", response_model=list[dict])
async def get_dataset_schema(dataset_id: str, session: AsyncSession = Depends(get_db_session)) -> list[dict]:
    service = DatasetCatalogService(DatasetFileService(get_settings()))
    dataset = await service.get_dataset(session, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return dataset.schema_json or []


@router.get("/{dataset_id}/preview", response_model=DatasetPreviewResponse)
async def preview_dataset(dataset_id: str, session: AsyncSession = Depends(get_db_session)) -> DatasetPreviewResponse:
    service = DatasetCatalogService(DatasetFileService(get_settings()))
    dataset = await service.get_dataset(session, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    rows, schema, row_count = service.preview(dataset)
    return DatasetPreviewResponse(dataset_id=dataset_id, rows=rows, schema=schema, row_count=row_count)


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(dataset_id: str, session: AsyncSession = Depends(get_db_session)) -> None:
    service = DatasetCatalogService(DatasetFileService(get_settings()))
    await service.delete(session, dataset_id)
    log_book.add("dataset", "info", f"Deleted dataset {dataset_id}")


from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import DatasetRecord
from app.schemas.datasets import DatasetRegistrationRequest, DatasetResponse
from app.services.storage.datasets import DatasetFileService


class DatasetCatalogService:
    def __init__(self, file_service: DatasetFileService) -> None:
        self.file_service = file_service

    async def list_datasets(self, session: AsyncSession) -> list[DatasetResponse]:
        rows = (await session.execute(select(DatasetRecord).order_by(DatasetRecord.created_at.desc()))).scalars().all()
        return [self._to_schema(row) for row in rows]

    async def get_dataset(self, session: AsyncSession, dataset_id: str) -> DatasetRecord | None:
        return await session.get(DatasetRecord, dataset_id)

    async def register(self, session: AsyncSession, payload: DatasetRegistrationRequest) -> DatasetResponse:
        source_path = self.file_service.resolve_upload(payload.upload_token)
        schema, row_count = self.file_service.compute_metadata(
            source_path,
            delimiter=payload.delimiter,
            has_header=payload.has_header,
        )
        record = DatasetRecord(
            name=payload.dataset_name,
            description=payload.description,
            tags=payload.tags,
            source_type=source_path.suffix.lstrip(".").upper(),
            source_id=payload.upload_token,
            schema_json=schema,
            metadata_json={
                "delimiter": payload.delimiter,
                "has_header": payload.has_header,
                "infer_schema": payload.infer_schema,
            },
            location=str(source_path),
            created_by=payload.created_by,
            row_count=row_count,
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)
        return self._to_schema(record)

    async def delete(self, session: AsyncSession, dataset_id: str) -> None:
        record = await session.get(DatasetRecord, dataset_id)
        if record is None:
            return
        await session.delete(record)
        await session.commit()

    def preview(self, record: DatasetRecord, limit: int = 25) -> tuple[list[dict], list[dict], int]:
        metadata = record.metadata_json or {}
        return self.file_service.read_preview(
            record.location,
            limit=limit,
            delimiter=metadata.get("delimiter", ","),
            has_header=metadata.get("has_header", True),
        )

    @staticmethod
    def _to_schema(record: DatasetRecord) -> DatasetResponse:
        return DatasetResponse(
            id=record.id,
            name=record.name,
            description=record.description,
            tags=record.tags or [],
            source_type=record.source_type,
            source_id=record.source_id,
            schema=record.schema_json or [],
            metadata=record.metadata_json or {},
            location=record.location,
            created_by=record.created_by,
            created_at=record.created_at,
            updated_at=record.updated_at,
            row_count=record.row_count,
        )

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import RuntimeSettings
from app.core.security import CredentialCipher
from app.models.entities import DatasourceRecord
from app.schemas.datasources import DatasourceCreate, DatasourceResponse, DatasourceUpdate


class DatasourceService:
    def __init__(self, settings: RuntimeSettings) -> None:
        self.settings = settings
        self.cipher = CredentialCipher(settings.app_credential_key)

    async def list_all(self, session: AsyncSession) -> list[DatasourceResponse]:
        records = (await session.execute(select(DatasourceRecord).order_by(DatasourceRecord.created_at.desc()))).scalars().all()

        configured = [
            DatasourceResponse(
                id=item.id,
                name=item.name,
                type=item.type,
                host=item.host,
                port=item.port,
                database=item.database,
                schema_name=item.schema_name,
                username=None,
                jdbc_url=item.jdbc_url,
                metadata={},
                runtime_managed=False,
                has_password=True,
            )
            for item in self.settings.datasource.configured_connections
        ]

        runtime = [
            DatasourceResponse(
                id=row.id,
                name=row.name,
                type=row.type,
                host=row.host,
                port=row.port,
                database=row.database,
                schema_name=row.schema_name,
                username=row.username,
                jdbc_url=row.jdbc_url,
                metadata=row.metadata_json or {},
                runtime_managed=True,
                created_at=row.created_at,
                updated_at=row.updated_at,
                has_password=bool(row.encrypted_password),
            )
            for row in records
        ]
        return configured + runtime

    async def create(self, session: AsyncSession, payload: DatasourceCreate) -> DatasourceResponse:
        record = DatasourceRecord(
            name=payload.name,
            type=payload.type,
            host=payload.host,
            port=payload.port,
            database=payload.database,
            schema_name=payload.schema_name,
            username=payload.username,
            encrypted_password=self.cipher.encrypt(payload.password),
            jdbc_url=payload.jdbc_url,
            metadata_json=payload.metadata,
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)
        return DatasourceResponse(
            id=record.id,
            name=record.name,
            type=record.type,
            host=record.host,
            port=record.port,
            database=record.database,
            schema_name=record.schema_name,
            username=record.username,
            jdbc_url=record.jdbc_url,
            metadata=record.metadata_json or {},
            runtime_managed=True,
            created_at=record.created_at,
            updated_at=record.updated_at,
            has_password=bool(record.encrypted_password),
        )

    async def update(self, session: AsyncSession, datasource_id: str, payload: DatasourceUpdate) -> DatasourceResponse | None:
        record = await session.get(DatasourceRecord, datasource_id)
        if record is None:
            return None

        record.name = payload.name
        record.type = payload.type
        record.host = payload.host
        record.port = payload.port
        record.database = payload.database
        record.schema_name = payload.schema_name
        record.username = payload.username
        record.jdbc_url = payload.jdbc_url
        record.metadata_json = payload.metadata
        if payload.password:
            record.encrypted_password = self.cipher.encrypt(payload.password)

        await session.commit()
        await session.refresh(record)
        return DatasourceResponse(
            id=record.id,
            name=record.name,
            type=record.type,
            host=record.host,
            port=record.port,
            database=record.database,
            schema_name=record.schema_name,
            username=record.username,
            jdbc_url=record.jdbc_url,
            metadata=record.metadata_json or {},
            runtime_managed=True,
            created_at=record.created_at,
            updated_at=record.updated_at,
            has_password=bool(record.encrypted_password),
        )

    async def delete(self, session: AsyncSession, datasource_id: str) -> None:
        record = await session.get(DatasourceRecord, datasource_id)
        if record is None:
            return
        await session.delete(record)
        await session.commit()

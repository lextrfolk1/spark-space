from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DatasourceBase(BaseModel):
    name: str
    type: str
    host: str
    port: int
    database: str | None = None
    schema_name: str | None = None
    username: str | None = None
    jdbc_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class DatasourceCreate(DatasourceBase):
    password: str | None = None


class DatasourceTestRequest(DatasourceBase):
    password: str | None = None


class DatasourceResponse(DatasourceBase):
    id: str
    runtime_managed: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None
    has_password: bool = False


class DatasourceTestResponse(BaseModel):
    success: bool
    message: str


from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DatasetRegistrationRequest(BaseModel):
    upload_token: str
    dataset_name: str
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    delimiter: str = ","
    has_header: bool = True
    infer_schema: bool = True
    created_by: str = "workspace-user"


class DatasetResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    source_type: str
    source_id: str | None = None
    schema: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    location: str
    created_by: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    row_count: int = 0


class DatasetPreviewResponse(BaseModel):
    dataset_id: str
    rows: list[dict[str, Any]]
    schema: list[dict[str, Any]]
    row_count: int


class UploadResponse(BaseModel):
    upload_token: str
    filename: str
    content_type: str | None = None
    bytes_written: int
    detected_format: str


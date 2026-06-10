from __future__ import annotations

import csv
import json
from pathlib import Path
from uuid import uuid4

import pandas as pd
from fastapi import HTTPException, UploadFile, status

from app.core.config import RuntimeSettings
from app.schemas.datasets import UploadResponse


class DatasetFileService:
    def __init__(self, settings: RuntimeSettings) -> None:
        self.settings = settings
        self.upload_path = Path(settings.storage.upload_path)
        self.storage_path = Path(settings.storage.local_path)
        self.upload_path.mkdir(parents=True, exist_ok=True)
        self.storage_path.mkdir(parents=True, exist_ok=True)

    async def store_upload(self, upload: UploadFile) -> UploadResponse:
        suffix = upload.filename.split(".")[-1].lower() if upload.filename and "." in upload.filename else ""
        if suffix not in self.settings.upload.allowed_extensions:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type")

        contents = await upload.read()
        max_size = self.settings.upload.max_file_size_mb * 1024 * 1024
        if len(contents) > max_size:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Upload too large")

        token = str(uuid4())
        destination = self.upload_path / f"{token}.{suffix}"
        destination.write_bytes(contents)
        return UploadResponse(
            upload_token=token,
            filename=upload.filename or destination.name,
            content_type=upload.content_type,
            bytes_written=len(contents),
            detected_format=suffix,
        )

    def resolve_upload(self, token: str) -> Path:
        matches = list(self.upload_path.glob(f"{token}.*"))
        if not matches:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload token not found")
        return matches[0]

    def read_preview(self, file_path: str | Path, limit: int = 25, delimiter: str = ",") -> tuple[list[dict], list[dict], int]:
        path = Path(file_path)
        suffix = path.suffix.lower().lstrip(".")

        if suffix == "csv":
            with path.open("r", encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle, delimiter=delimiter)
                rows = [row for _, row in zip(range(limit), reader)]
            schema = [{"name": key, "type": "string"} for key in rows[0].keys()] if rows else []
            return rows, schema, len(rows)

        if suffix == "json":
            with path.open("r", encoding="utf-8") as handle:
                loaded = json.load(handle)
            rows = loaded if isinstance(loaded, list) else [loaded]
            rows = rows[:limit]
            schema = [{"name": key, "type": type(value).__name__} for key, value in rows[0].items()] if rows else []
            return rows, schema, len(rows)

        if suffix == "parquet":
            dataframe = pd.read_parquet(path).head(limit)
            rows = dataframe.to_dict(orient="records")
            schema = [{"name": name, "type": str(dtype)} for name, dtype in dataframe.dtypes.items()]
            return rows, schema, len(rows)

        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Preview is not supported for this file")

    def compute_metadata(self, file_path: str | Path, delimiter: str = ",") -> tuple[list[dict], int]:
        rows, schema, row_count = self.read_preview(file_path=file_path, limit=self.settings.execution.max_rows, delimiter=delimiter)
        return schema, row_count if row_count else len(rows)


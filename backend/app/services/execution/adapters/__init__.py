"""
Data source adapters for the execution framework.

Each adapter encapsulates connection and query logic for a specific
database or data source type. To add a new data source:
1. Create a class extending DataSourceAdapter
2. Implement connect(), execute_query(), get_schema(), disconnect()
3. Register it in the AdapterRegistry below
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any

import pandas as pd

from app.services.execution.base import DataSourceAdapter, RawResult


class SqliteAdapter(DataSourceAdapter):
    """
    Adapter for in-memory SQLite execution against registered datasets.
    Used for local dataset querying without a remote database.
    """

    def __init__(self) -> None:
        self._connection: sqlite3.Connection | None = None
        self._frames: dict[str, pd.DataFrame] = {}

    async def connect(self, config: dict[str, Any]) -> None:
        import re
        from pathlib import Path
        self._connection = sqlite3.connect(":memory:")
        self._frames = config.get("dataset_frames", {})
        for name, frame in self._frames.items():
            stem_name = Path(name).stem
            clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', name)
            clean_stem = re.sub(r'[^a-zA-Z0-9_]', '_', stem_name)
            
            registered = set()
            for n in [name, clean_name, stem_name, clean_stem, name.lower(), clean_name.lower(), stem_name.lower(), clean_stem.lower()]:
                if n and n not in registered:
                    frame.to_sql(n, self._connection, index=False, if_exists="replace")
                    registered.add(n)

    async def execute_query(self, query: str, limit: int = 100) -> RawResult:
        if self._connection is None:
            return RawResult(status="failed", error="Not connected")

        try:
            stripped = query.strip().rstrip(";")
            limited = f"SELECT * FROM ({stripped}) AS result LIMIT {limit}"
            frame = pd.read_sql_query(limited, self._connection)

            schema = [{"name": name, "type": str(dtype)} for name, dtype in frame.dtypes.items()]
            rows = json.loads(frame.to_json(orient="records", date_format="iso"))

            return RawResult(
                status="completed",
                columns=list(frame.columns),
                schema=schema,
                rows=rows,
                statistics={"returnedRows": len(rows), "engine": "sqlite"},
                logs=["Query executed against in-memory SQLite."],
            )
        except Exception as exc:
            return RawResult(status="failed", error=str(exc))

    async def get_schema(self, table_name: str | None = None) -> list[dict[str, Any]]:
        if self._connection is None:
            return []
        if table_name:
            cursor = self._connection.execute(f"PRAGMA table_info({table_name})")
            return [{"name": row[1], "type": row[2]} for row in cursor.fetchall()]
        # List all tables
        cursor = self._connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
        return [{"table": row[0]} for row in cursor.fetchall()]

    async def disconnect(self) -> None:
        if self._connection:
            self._connection.close()
            self._connection = None

    def supports(self, datasource_type: str) -> bool:
        return datasource_type.upper() in {"SQLITE", "LOCAL", "DATASET"}


class PostgresAdapter(DataSourceAdapter):
    """
    Adapter for PostgreSQL databases via asyncpg.
    Wraps the existing asyncpg connection logic from the pipeline.
    """

    def __init__(self) -> None:
        self._config: dict[str, Any] = {}

    async def connect(self, config: dict[str, Any]) -> None:
        self._config = config

    async def execute_query(self, query: str, limit: int = 100) -> RawResult:
        import asyncpg

        host = self._config.get("host", "localhost")
        port = self._config.get("port", 5432)
        username = self._config.get("username")
        password = self._config.get("password")
        database = self._config.get("database")

        if not username or password is None or not database:
            return RawResult(
                status="failed",
                error="Missing credentials for PostgreSQL connection.",
            )

        connection = None
        try:
            connection = await asyncpg.connect(
                host=host, port=port, user=username,
                password=password, database=database, timeout=3,
            )
            schema_name = self._config.get("schema_name")
            if schema_name:
                await connection.fetchval(
                    "SELECT set_config('search_path', $1, false)", schema_name
                )

            stripped = query.strip().rstrip(";")
            limited = f"SELECT * FROM ({stripped}) AS workspace_result LIMIT {limit}"
            statement = await connection.prepare(limited)
            records = await statement.fetch()
            rows = [dict(r) for r in records]

            if rows:
                columns = list(rows[0].keys())
            else:
                columns = [attr.name for attr in statement.get_attributes()]

            frame = pd.DataFrame(rows, columns=columns)
            schema = [{"name": name, "type": str(dtype)} for name, dtype in frame.dtypes.items()]
            serialized_rows = json.loads(frame.to_json(orient="records", date_format="iso"))

            return RawResult(
                status="completed",
                columns=columns,
                schema=schema,
                rows=serialized_rows,
                statistics={"returnedRows": len(rows), "engine": "postgresql", "host": host},
                logs=[f"Query executed against PostgreSQL at {host}:{port}/{database}."],
            )
        except Exception as exc:
            return RawResult(status="failed", error=str(exc))
        finally:
            if connection is not None:
                await connection.close()

    async def get_schema(self, table_name: str | None = None) -> list[dict[str, Any]]:
        return []  # TODO: implement via information_schema query

    async def disconnect(self) -> None:
        pass  # Connections are per-query for now

    def supports(self, datasource_type: str) -> bool:
        return datasource_type.upper() in {"POSTGRESQL", "POSTGRES"}


class SparkAdapter(DataSourceAdapter):
    """
    Adapter for Spark SQL via Spark Connect.
    Wraps the existing Spark Connect logic from the pipeline.
    """

    def __init__(self) -> None:
        self._config: dict[str, Any] = {}

    async def connect(self, config: dict[str, Any]) -> None:
        self._config = config

    async def execute_query(self, query: str, limit: int = 100) -> RawResult:
        # Delegates to existing Spark logic in pipeline.py
        return RawResult(
            status="completed",
            logs=["Spark adapter execution placeholder."],
            result_type="TABLE",
        )

    async def get_schema(self, table_name: str | None = None) -> list[dict[str, Any]]:
        return []

    async def disconnect(self) -> None:
        pass

    def supports(self, datasource_type: str) -> bool:
        return datasource_type.upper() in {"SPARK", "SPARK_SQL"}


# ---------------------------------------------------------------------------
# Adapter Registry
# ---------------------------------------------------------------------------

class AdapterRegistry:
    """Registry of data source adapters."""

    def __init__(self) -> None:
        self._adapters: list[DataSourceAdapter] = [
            SqliteAdapter(),
            PostgresAdapter(),
            SparkAdapter(),
        ]

    def get_adapter(self, datasource_type: str) -> DataSourceAdapter:
        for adapter in self._adapters:
            if adapter.supports(datasource_type):
                return adapter
        raise KeyError(f"No adapter for datasource type: {datasource_type}")

    def register(self, adapter: DataSourceAdapter) -> None:
        self._adapters.insert(0, adapter)

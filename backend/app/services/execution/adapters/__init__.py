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

            # Register uploaded datasets as temporary tables in PostgreSQL
            datasets = self._config.get("datasets", [])
            frames = self._config.get("dataset_frames", {})
            import re
            from pathlib import Path
            import numpy as np

            def _pandas_type_to_postgres(dtype) -> str:
                name = str(dtype).lower()
                if "int" in name:
                    return "INTEGER"
                elif "float" in name or "double" in name or "decimal" in name:
                    return "DOUBLE PRECISION"
                elif "bool" in name:
                    return "BOOLEAN"
                elif "datetime" in name or "timestamp" in name:
                    return "TIMESTAMP"
                else:
                    return "TEXT"

            for dataset in datasets:
                frame = frames.get(dataset.id)
                if frame is None:
                    frame = frames.get(dataset.name)
                if frame is not None:
                    clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', dataset.name)
                    stem_name = Path(dataset.name).stem
                    clean_stem = re.sub(r'[^a-zA-Z0-9_]', '_', stem_name)

                    tables_to_create = set()
                    for n in [dataset.name, clean_name, stem_name, clean_stem, dataset.name.lower(), clean_name.lower(), stem_name.lower(), clean_stem.lower()]:
                        if n:
                            tables_to_create.add(n)

                    columns_definition = ", ".join(f'"{col}" {_pandas_type_to_postgres(dtype)}' for col, dtype in frame.dtypes.items())
                    records = [
                        tuple(None if pd.isna(val) else val for val in row)
                        for row in frame.itertuples(index=False)
                    ]

                    for table_name in tables_to_create:
                        await connection.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                        await connection.execute(f'CREATE TEMPORARY TABLE "{table_name}" ({columns_definition})')
                        if records:
                            await connection.copy_records_to_table(table_name, records=records, columns=list(frame.columns))

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
    Wraps the Spark Connect logic to connect to a remote Spark service and run queries,
    automatically registering local datasets as temporary views.
    """

    def __init__(self) -> None:
        self._config: dict[str, Any] = {}

    async def connect(self, config: dict[str, Any]) -> None:
        self._config = config

    async def execute_query(self, query: str, limit: int = 100) -> RawResult:
        import asyncio
        from pyspark.sql import SparkSession
        import logging
        logger = logging.getLogger(__name__)

        host = self._config.get("host", "spark")
        port = self._config.get("port", 15002)
        remote = f"sc://{host}:{port}"

        p_logs = []
        p_warnings = []
        try:
            spark = await asyncio.to_thread(self._get_spark_session, remote)

            # Register datasets as temp views
            datasets = self._config.get("datasets", [])
            frames = self._config.get("dataset_frames", {})
            for dataset in datasets:
                frame = frames.get(dataset.id)
                if frame is not None:
                    await asyncio.to_thread(self._register_dataset, spark, dataset.name, frame)

            # Register PostgreSQL tables if any
            postgres_config = self._config.get("postgres_config")
            if postgres_config:
                p_logs, p_warnings = await register_postgres_tables_in_spark(spark, postgres_config)

            # Run the query
            def run_sql():
                df = spark.sql(query.strip().rstrip(";")).limit(limit)
                pandas_frame = df.toPandas()
                if pandas_frame.empty:
                    pandas_frame = pd.DataFrame(columns=df.columns)
                return pandas_frame

            result_frame = await asyncio.to_thread(run_sql)
            schema = [{"name": name, "type": str(dtype)} for name, dtype in result_frame.dtypes.items()]
            rows = json.loads(result_frame.to_json(orient="records", date_format="iso"))

            return RawResult(
                status="completed",
                columns=list(result_frame.columns),
                schema=schema,
                rows=rows,
                statistics={"returnedRows": len(rows), "engine": "spark_sql", "host": host},
                logs=[
                    "Connected to Spark Connect session.",
                    "SQL query executed on remote Spark cluster."
                ] + p_logs,
                warnings=p_warnings,
            )
        except Exception as exc:
            logger.error(f"Spark Connect query failed: {exc}", exc_info=True)
            return RawResult(status="failed", error=str(exc), logs=p_logs, warnings=p_warnings)

    def _get_spark_session(self, remote: str) -> SparkSession:
        from app.services.execution.pipeline import _get_spark_connect_session
        return _get_spark_connect_session(remote, self._config)

    def _register_dataset(self, spark: SparkSession, name: str, frame: pd.DataFrame) -> None:
        import re
        clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', name)
        try:
            spark_df = spark.createDataFrame(frame)
            spark_df.createOrReplaceTempView(clean_name)
            if clean_name != name:
                spark_df.createOrReplaceTempView(name)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to register Spark view for {name}: {e}")

    async def get_schema(self, table_name: str | None = None) -> list[dict[str, Any]]:
        return []

    async def disconnect(self) -> None:
        pass

    def supports(self, datasource_type: str) -> bool:
        return datasource_type.upper() in {"SPARK", "SPARK_SQL"}


async def register_postgres_tables_in_spark(spark: SparkSession, postgres_config: dict[str, Any], query: str | None = None) -> tuple[list[str], list[str]]:
    import asyncio
    import asyncpg
    import pandas as pd
    import re
    import logging
    import uuid
    from decimal import Decimal
    logger = logging.getLogger(__name__)

    logs = []
    warnings = []

    logs.append("--- [START] register_postgres_tables_in_spark ---")

    host = postgres_config.get("host")
    port = postgres_config.get("port")
    user = postgres_config.get("username")
    password = postgres_config.get("password")
    database = postgres_config.get("database")
    schema_name = postgres_config.get("schema_name") or "public"

    logs.append(f"Postgres Connection Config: host={host}, port={port}, user={user}, database={database}, schema={schema_name}")

    if not host or not user or password is None or not database:
        warnings.append("Error: Incomplete PostgreSQL credentials.")
        logger.warning("PostgreSQL credentials incomplete for Spark registration.")
        return logs, warnings

    logs.append(f"Connecting to PostgreSQL to fetch tables for Spark view registration: {host}:{port}/{database}")
    try:
        connection = await asyncpg.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            timeout=5,
        )
        logs.append("Connected to PostgreSQL successfully!")
        try:
            # Query all user tables in the schema
            db_query = """
                SELECT table_schema, table_name 
                FROM information_schema.tables 
                WHERE table_schema NOT IN ('pg_catalog', 'information_schema') 
                  AND table_type = 'BASE TABLE'
            """
            rows = await connection.fetch(db_query)
            logs.append(f"Discovered {len(rows)} tables in PostgreSQL database")
            
            query_lower = query.lower() if query else None
            for r in rows:
                t_schema = r["table_schema"]
                t_name = r["table_name"]
                clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', t_name)

                # Only register tables that are mentioned in the query
                if query_lower is not None:
                    mentioned = False
                    for check_name in [t_name, clean_name, f"{t_schema}.{t_name}", f"{t_schema}.{clean_name}", f"{t_schema}_{t_name}"]:
                        if check_name and check_name.lower() in query_lower:
                            mentioned = True
                            break
                    if not mentioned:
                        continue

                logs.append(f"Registering table: {t_schema}.{t_name}")
                
                # Fetch up to 100 rows to represent the table structure and recent data
                try:
                    data_rows = await connection.fetch(f'SELECT * FROM "{t_schema}"."{t_name}" LIMIT 100')
                    dicts = [dict(record) for record in data_rows]
                    logs.append(f"Fetched {len(dicts)} rows for table {t_schema}.{t_name}")
                except Exception as fetch_exc:
                    warnings.append(f"Failed to fetch rows for table {t_schema}.{t_name}: {fetch_exc}")
                    continue
                
                if dicts:
                    df = pd.DataFrame(dicts)
                    for col in df.columns:
                        # Convert Decimal
                        if any(isinstance(val, Decimal) for val in df[col].dropna()):
                            df[col] = df[col].apply(lambda x: float(x) if isinstance(x, Decimal) else x)
                        # Convert UUID
                        if any(isinstance(val, uuid.UUID) for val in df[col].dropna()):
                            df[col] = df[col].apply(lambda x: str(x) if isinstance(x, uuid.UUID) else x)

                    def reg():
                        try:
                            spark_df = spark.createDataFrame(df)
                            
                            # Register in target namespace if schema is not default
                            if t_schema and t_schema.lower() != "default":
                                spark.sql(f"CREATE DATABASE IF NOT EXISTS {t_schema}")
                                spark_df.write.mode("overwrite").saveAsTable(f"{t_schema}.{clean_name}")
                                if clean_name != t_name:
                                    spark_df.write.mode("overwrite").saveAsTable(f"{t_schema}.{t_name}")
                            
                            # Also register flat views
                            spark_df.createOrReplaceTempView(clean_name)
                            if clean_name != t_name:
                                spark_df.createOrReplaceTempView(t_name)
                                
                            # Also register prefixed view schema_table
                            spark_df.createOrReplaceTempView(f"{t_schema}_{clean_name}")
                            if clean_name != t_name:
                                spark_df.createOrReplaceTempView(f"{t_schema}_{t_name}")
                                
                            logger.info(f"Successfully registered PostgreSQL table '{t_schema}.{t_name}' in Spark Connect")
                            logs.append(f"Successfully registered PostgreSQL table '{t_schema}.{t_name}' in Spark Connect")
                        except Exception as e:
                            logger.error(f"Failed to register Spark view for '{t_schema}.{t_name}': {e}")
                            logs.append(f"Failed to register Spark view for '{t_schema}.{t_name}': {e}")
                            warnings.append(f"Failed to register Spark view for '{t_schema}.{t_name}': {e}")

                    await asyncio.to_thread(reg)
                else:
                    columns_query = """
                        SELECT column_name, data_type 
                        FROM information_schema.columns 
                        WHERE table_schema = $1 AND table_name = $2
                        ORDER BY ordinal_position
                    """
                    col_rows = await connection.fetch(columns_query, t_schema, t_name)
                    
                    # Build StructType for empty table
                    from pyspark.sql.types import StructType, StructField, StringType, IntegerType, DoubleType, BooleanType, TimestampType, LongType
                    
                    fields = []
                    for col_r in col_rows:
                        col_name = col_r["column_name"]
                        col_type = col_r["data_type"].lower()
                        
                        if "int2" in col_type or "int4" in col_type or "integer" in col_type:
                            spark_type = IntegerType()
                        elif "int8" in col_type or "bigint" in col_type:
                            spark_type = LongType()
                        elif "numeric" in col_type or "decimal" in col_type or "double" in col_type or "real" in col_type:
                            spark_type = DoubleType()
                        elif "bool" in col_type:
                            spark_type = BooleanType()
                        elif "timestamp" in col_type or "date" in col_type:
                            spark_type = TimestampType()
                        else:
                            spark_type = StringType()
                            
                        fields.append(StructField(col_name, spark_type, True))
                    
                    schema = StructType(fields)
                    
                    def reg_empty():
                        try:
                            # Create empty DataFrame with schema
                            spark_df = spark.createDataFrame([], schema=schema)
                            
                            # Register in target namespace if schema is not default
                            if t_schema and t_schema.lower() != "default":
                                spark.sql(f"CREATE DATABASE IF NOT EXISTS {t_schema}")
                                spark_df.write.mode("overwrite").saveAsTable(f"{t_schema}.{clean_name}")
                                if clean_name != t_name:
                                    spark_df.write.mode("overwrite").saveAsTable(f"{t_schema}.{t_name}")
                            
                            # Also register flat views
                            spark_df.createOrReplaceTempView(clean_name)
                            if clean_name != t_name:
                                spark_df.createOrReplaceTempView(t_name)
                                
                            # Also register prefixed view schema_table
                            spark_df.createOrReplaceTempView(f"{t_schema}_{clean_name}")
                            if clean_name != t_name:
                                spark_df.createOrReplaceTempView(f"{t_schema}_{t_name}")
                                
                            logger.info(f"Successfully registered empty PostgreSQL table '{t_schema}.{t_name}' in Spark Connect")
                            logs.append(f"Successfully registered empty PostgreSQL table '{t_schema}.{t_name}' in Spark Connect")
                        except Exception as e:
                            logger.error(f"Failed to register Spark view for empty '{t_schema}.{t_name}': {e}")
                            logs.append(f"Failed to register Spark view for empty '{t_schema}.{t_name}': {e}")
                            warnings.append(f"Failed to register Spark view for empty '{t_schema}.{t_name}': {e}")

                    await asyncio.to_thread(reg_empty)
        finally:
            await connection.close()
    except Exception as e:
        logger.error(f"Failed to fetch PostgreSQL tables for Spark: {e}", exc_info=True)
        logs.append(f"Failed to fetch PostgreSQL tables for Spark: {e}")
        warnings.append(f"Failed to fetch PostgreSQL tables for Spark: {e}")

    return logs, warnings


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

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import pandas as pd

from app.models.entities import DatasetRecord
from app.schemas.notebooks import CellExecuteRequest
from app.services.execution.executors.python_dataframe_executor import PythonDataFrameExecutor
from app.services.execution.factory import get_executor_factory


class PythonDataFrameExecutorTests(unittest.IsolatedAsyncioTestCase):
    async def test_factory_registration(self) -> None:
        factory = get_executor_factory()
        executor = factory.get_executor("PYTHON_DATAFRAME")
        self.assertIsInstance(executor, PythonDataFrameExecutor)

    async def test_validation(self) -> None:
        executor = PythonDataFrameExecutor()
        
        # Valid code
        req = CellExecuteRequest(
            cellType="PYTHON_DATAFRAME",
            inputType="DATAFRAME_COMMAND",
            content="customers_smoke.select('name')"
        )
        res = await executor.validate(req)
        self.assertTrue(res.valid)
        
        # Empty code
        req_empty = CellExecuteRequest(
            cellType="PYTHON_DATAFRAME",
            inputType="DATAFRAME_COMMAND",
            content=""
        )
        res_empty = await executor.validate(req_empty)
        self.assertFalse(res_empty.valid)
        self.assertIn("empty", res_empty.errors[0])

        # Invalid Python syntax
        req_syntax = CellExecuteRequest(
            cellType="PYTHON_DATAFRAME",
            inputType="DATAFRAME_COMMAND",
            content="customers_smoke.select("
        )
        res_syntax = await executor.validate(req_syntax)
        self.assertFalse(res_syntax.valid)
        self.assertIn("Invalid Python syntax", res_syntax.errors[0])

    async def test_execution_against_dataset(self) -> None:
        mock_dataset = DatasetRecord(
            id="dataset-123",
            name="customers_smoke",
            source_type="csv",
            location="/tmp/customers_smoke.csv",
        )
        
        # Mock database session execution to return mock_dataset
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_dataset]
        mock_session.execute.return_value = mock_result
        
        dummy_df = pd.DataFrame([
            {"id": 1, "name": "Ada", "city": "Boston"},
            {"id": 2, "name": "Grace", "city": "Austin"},
        ])
        
        executor = PythonDataFrameExecutor()
        
        req = CellExecuteRequest(
            cellType="PYTHON_DATAFRAME",
            inputType="DATAFRAME_COMMAND",
            content="customers_smoke.select('name').limit(1)",
            context={}
        )
        
        # We patch load_dataframe to return our dummy_df
        with patch("app.services.storage.datasets.DatasetFileService.load_dataframe", return_value=dummy_df):
            response = await executor.run(req, session=mock_session)
            
            self.assertEqual(response.status, "SUCCESS")
            self.assertEqual(response.rows, [{"name": "Ada"}])
            self.assertEqual(response.columns, ["name"])
            self.assertEqual(response.row_count, 1)

    async def test_spark_connect_pyspark_execution(self) -> None:
        mock_dataset = DatasetRecord(
            id="dataset-123",
            name="customers_smoke",
            source_type="csv",
            location="/tmp/customers_smoke.csv",
        )
        
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_dataset]
        mock_session.execute.return_value = mock_result
        
        dummy_df = pd.DataFrame([
            {"id": 1, "name": "Ada"},
        ])
        
        executor = PythonDataFrameExecutor()
        
        req = CellExecuteRequest(
            cellType="PYTHON_DATAFRAME",
            inputType="DATAFRAME_COMMAND",
            content="spark.sql('SELECT name FROM customers_smoke').limit(1)",
            context={}
        )
        
        # Mock SparkSession and remote connection
        mock_spark = MagicMock()
        mock_df = MagicMock()
        mock_pandas_df = pd.DataFrame([{"name": "Ada"}])
        mock_df.limit.return_value = mock_df
        mock_df.toPandas.return_value = mock_pandas_df
        mock_df.columns = ["name"]
        mock_spark.sql.return_value = mock_df
        
        # We patch load_dataframe to return our dummy_df and patch Spark Connect session builder
        with patch("app.services.storage.datasets.DatasetFileService.load_dataframe", return_value=dummy_df), \
             patch("app.services.execution.pipeline._get_spark_connect_session", return_value=mock_spark):
             
            response = await executor.run(req, session=mock_session)
            
            self.assertEqual(response.status, "SUCCESS")
            self.assertEqual(response.rows, [{"name": "Ada"}])
            self.assertEqual(response.columns, ["name"])
            self.assertEqual(response.row_count, 1)


class SqlExecutorAndSparkAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_sql_executor_default_spark_local_fallback(self) -> None:
        from app.services.execution.executors import SqlExecutor
        from app.core.config import RuntimeSettings, ConfiguredDatasource
        
        executor = SqlExecutor()
        req = CellExecuteRequest(
            cellType="SQL",
            inputType="STRUCTURED_QUERY",
            content="SELECT * FROM customers_smoke",
            context={} # no connectionId
        )
        
        # Mock database session
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_session.execute.return_value = mock_result
        
        # Mock settings to return a configured spark_local connection
        settings = RuntimeSettings()
        settings.datasource.configured_connections = [
            ConfiguredDatasource(
                id="spark_local",
                name="Spark Local",
                type="SPARK",
                host="spark",
                port=15002,
                database="default",
                schema_name="default",
                jdbc_url="sc://spark:15002",
                runtime_managed=False
            )
        ]
        
        with patch("app.core.config.get_settings", return_value=settings):
            plan = await executor.plan(req, session=mock_session)
            
            # Assert that the plan resolved datasource to the default spark_local configured connection
            self.assertIsNotNone(plan.datasource)
            self.assertEqual(plan.datasource.id, "spark_local")
            self.assertEqual(plan.datasource.type, "SPARK")
            self.assertEqual(plan.connection_config["host"], "spark")
            self.assertEqual(plan.connection_config["port"], 15002)

    async def test_spark_adapter_executes_query_successfully(self) -> None:
        from app.services.execution.adapters import SparkAdapter
        
        adapter = SparkAdapter()
        config = {
            "host": "spark",
            "port": 15002,
            "datasets": [
                DatasetRecord(id="ds-1", name="customers_smoke", source_type="csv", location="loc")
            ],
            "dataset_frames": {
                "ds-1": pd.DataFrame([{"id": 1, "name": "Ada"}])
            }
        }
        
        await adapter.connect(config)
        self.assertTrue(adapter.supports("SPARK"))
        
        # Mock SparkSession and remote connection
        mock_spark = MagicMock()
        mock_df = MagicMock()
        mock_pandas_df = pd.DataFrame([{"id": 1, "name": "Ada"}])
        mock_df.limit.return_value = mock_df
        mock_df.toPandas.return_value = mock_pandas_df
        mock_df.columns = ["id", "name"]
        mock_spark.sql.return_value = mock_df
        
        with patch.object(adapter, "_get_spark_session", return_value=mock_spark):
            result = await adapter.execute_query("SELECT * FROM customers_smoke", limit=10)
            
            self.assertEqual(result.status, "completed")
            self.assertEqual(result.rows, [{"id": 1, "name": "Ada"}])
            self.assertEqual(result.columns, ["id", "name"])
            self.assertIn("Connected to Spark Connect session.", result.logs[0])

    async def test_postgres_adapter_registers_temp_tables(self) -> None:
        from app.services.execution.adapters import PostgresAdapter
        
        adapter = PostgresAdapter()
        config = {
            "host": "localhost",
            "port": 5432,
            "username": "user",
            "password": "pwd",
            "database": "db",
            "datasets": [
                DatasetRecord(id="ds-1", name="customers_smoke", source_type="csv", location="loc")
            ],
            "dataset_frames": {
                "ds-1": pd.DataFrame([{"id": 1, "name": "Ada"}])
            }
        }
        
        await adapter.connect(config)
        self.assertTrue(adapter.supports("POSTGRESQL"))
        
        mock_conn = AsyncMock()
        mock_statement = AsyncMock()
        mock_statement.fetch.return_value = [{"id": 1, "name": "Ada"}]
        mock_statement.get_attributes.return_value = []
        mock_conn.prepare.return_value = mock_statement
        
        with patch("asyncpg.connect", return_value=mock_conn) as mock_connect:
            result = await adapter.execute_query("SELECT * FROM customers_smoke", limit=10)
            
            self.assertIsNone(result.error, f"Execution failed with: {result.error}")
            self.assertEqual(result.status, "completed")
            mock_connect.assert_called_once()
            mock_conn.execute.assert_any_call('CREATE TEMPORARY TABLE "customers_smoke" ("id" INTEGER, "name" TEXT)')
            mock_conn.copy_records_to_table.assert_called_once()
            self.assertEqual(result.rows, [{"id": 1, "name": "Ada"}])


class SparkPostgresIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_register_postgres_tables_in_spark(self) -> None:
        from app.services.execution.adapters import register_postgres_tables_in_spark
        
        mock_spark = MagicMock()
        postgres_config = {
            "host": "localhost",
            "port": 5432,
            "username": "user",
            "password": "pwd",
            "database": "db",
        }
        
        mock_conn = AsyncMock()
        # Mock information_schema.tables result
        mock_conn.fetch.side_effect = [
            # first fetch: query tables
            [{"table_schema": "public", "table_name": "users"}],
            # second fetch: SELECT * FROM "public"."users" LIMIT 100
            [{"id": 1, "name": "Alice"}],
        ]
        
        with patch("asyncpg.connect", return_value=mock_conn) as mock_connect:
            await register_postgres_tables_in_spark(mock_spark, postgres_config)
            
            mock_connect.assert_called_once()
            # Verify Spark DataFrame creation and view registration
            mock_spark.createDataFrame.assert_called_once()
            mock_spark.createDataFrame.return_value.createOrReplaceTempView.assert_any_call("users")


if __name__ == "__main__":
    unittest.main()

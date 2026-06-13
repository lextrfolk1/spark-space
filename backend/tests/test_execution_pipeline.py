from __future__ import annotations

import unittest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pandas as pd

from app.core.config import RuntimeSettings
from app.models.entities import DatasetRecord
from app.schemas.executions import ExecutionRequest
from app.services.execution.pipeline import (
    ExecutionPlan,
    ExecutionService,
    SparkDataFrameExecutor,
    SparkSqlExecutor,
)


def _dataset() -> DatasetRecord:
    return DatasetRecord(
        id="dataset-1",
        name="customers",
        source_type="file",
        location="/tmp/customers.csv",
    )


def _plan(command: str) -> ExecutionPlan:
    dataset = _dataset()
    frame = pd.DataFrame(
        [
            {"id": 1, "name": "Ada", "city": "Boston"},
            {"id": 2, "name": "Grace", "city": "Austin"},
            {"id": 3, "name": "Linus", "city": "Boston"},
        ]
    )
    return ExecutionPlan(
        engine="spark_sql",
        command=command,
        datasets=[dataset],
        datasource_id=None,
        datasource=None,
        limit=25,
        execution_mode="current_cell",
        context={"dataset_frames": {dataset.id: frame}},
    )


class SparkSqlExecutorTests(unittest.IsolatedAsyncioTestCase):
    async def test_sql_query_filters_rows_instead_of_returning_preview(self) -> None:
        payload = await SparkSqlExecutor().execute(
            _plan("SELECT name FROM customers WHERE city = 'Boston' ORDER BY id")
        )

        self.assertEqual(payload.status, "completed")
        self.assertEqual(payload.rows, [{"name": "Ada"}, {"name": "Linus"}])

    async def test_sql_query_fails_for_unknown_table(self) -> None:
        payload = await SparkSqlExecutor().execute(_plan("SELECT * FROM missing_table"))

        self.assertEqual(payload.status, "failed")
        self.assertIn("no such table", payload.error or "")


class SparkDataFrameExecutorTests(unittest.IsolatedAsyncioTestCase):
    async def test_dataframe_query_applies_filter_select_and_limit(self) -> None:
        payload = await SparkDataFrameExecutor().execute(
            _plan('df.filter("city = \'Boston\'").select("name").limit(1)')
        )

        self.assertEqual(payload.status, "completed")
        self.assertEqual(payload.rows, [{"name": "Ada"}])

    async def test_dataframe_sql_query_works_with_limit(self) -> None:
        payload = await SparkDataFrameExecutor().execute(
            _plan('df.sql("SELECT name FROM customers WHERE city = \'Boston\' ORDER BY id").limit(1)')
        )

        self.assertEqual(payload.status, "completed")
        self.assertEqual(payload.rows, [{"name": "Ada"}])

    async def test_dataframe_alias_is_not_hardcoded(self) -> None:
        payload = await SparkDataFrameExecutor().execute(_plan('source.select("name").limit(1)'))

        self.assertEqual(payload.status, "completed")
        self.assertEqual(payload.rows, [{"name": "Ada"}])


class ExecutionServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_execution_service_auto_detects_dataset(self) -> None:
        mock_dataset = DatasetRecord(
            id="dataset-1",
            name="customers",
            source_type="csv",
            location="/tmp/customers.csv",
            metadata_json={"delimiter": ",", "has_header": True, "infer_schema": True},
        )

        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        async def mock_refresh(obj):
            obj.id = "test-execution-id"
        mock_session.refresh = mock_refresh

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_dataset]
        mock_session.execute.return_value = mock_result

        settings = RuntimeSettings()
        settings.execution.default_limit = 100
        settings.execution.max_rows = 1000

        service = ExecutionService(settings)

        dummy_df = pd.DataFrame([{"id": 1, "name": "Ada"}])
        from app.services.execution.base import RawResult
        fake_result = RawResult(
            status="completed",
            columns=["name"],
            rows=[{"name": "Ada"}],
            statistics={"returnedRows": 1}
        )
        
        with patch("app.services.execution.adapters.SparkAdapter.execute_sql", return_value=fake_result):
            request = ExecutionRequest(
                engine="spark_sql",
                command="SELECT name FROM customers",
                dataset_ids=[],
                context={"dataset_frames": {"dataset-1": dummy_df}}
            )
            response = await service.execute(mock_session, request)

            self.assertEqual(response.status, "SUCCESS")
            self.assertIn("dataset-1", response.dataset_ids)
            self.assertEqual(response.rows, [{"name": "Ada"}])

    async def test_execution_service_skips_detection_when_datasource_provided(self) -> None:
        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        async def mock_refresh(obj):
            obj.id = "test-execution-id"
        mock_session.refresh = mock_refresh
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_session.execute.return_value = mock_result

        settings = RuntimeSettings()
        from app.core.config import ConfiguredDatasource
        settings.datasource.configured_connections = [
            ConfiguredDatasource(
                id="postgres-1",
                name="Postgres DB",
                type="POSTGRESQL",
                host="localhost",
                port=5432,
                database="workspace",
                schema_name="public",
                jdbc_url="postgresql://localhost",
                runtime_managed=False,
            )
        ]

        service = ExecutionService(settings)

        from app.services.execution.base import RawResult
        fake_result = RawResult(
            status="completed",
            columns=["id", "value"],
            rows=[{"id": 10, "value": "live"}],
            statistics={"returnedRows": 1}
        )
        with patch("app.services.execution.executors.get_settings", return_value=settings), \
             patch("app.services.execution.adapters.PostgresAdapter.execute_sql", return_value=fake_result):
            request = ExecutionRequest(
                engine="spark_sql",
                command="SELECT value FROM test_table",
                datasource_id="postgres-1",
                dataset_ids=[],
            )
            response = await service.execute(mock_session, request)

            self.assertEqual(response.status, "SUCCESS")
            self.assertEqual(response.dataset_ids, [])
            self.assertEqual(response.rows, [{"id": 10, "value": "live"}])

    async def test_execution_service_routes_cross_source_to_spark(self) -> None:
        mock_dataset = DatasetRecord(
            id="dataset-1",
            name="customers",
            source_type="csv",
            location="/tmp/customers.csv",
            metadata_json={"delimiter": ",", "has_header": True, "infer_schema": True},
        )
        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        async def mock_refresh(obj):
            obj.id = "test-execution-id"
        mock_session.refresh = mock_refresh
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_dataset]
        mock_session.execute.return_value = mock_result

        settings = RuntimeSettings()
        from app.core.config import ConfiguredDatasource
        settings.datasource.configured_connections = [
            ConfiguredDatasource(
                id="postgres-1",
                name="Postgres DB",
                type="POSTGRESQL",
                host="localhost",
                port=5432,
                database="workspace",
                schema_name="public",
                jdbc_url="postgresql://localhost",
                runtime_managed=False,
            )
        ]

        service = ExecutionService(settings)

        dummy_df = pd.DataFrame([{"id": 1, "name": "Ada"}])
        from app.services.execution.base import RawResult
        fake_result = RawResult(
            status="completed",
            columns=["id", "name", "value"],
            rows=[{"id": 1, "name": "Ada", "value": "live"}],
            statistics={"returnedRows": 1}
        )
        
        with patch("app.services.execution.executors.get_settings", return_value=settings), \
             patch("app.services.execution.adapters.SparkAdapter.execute_sql", return_value=fake_result) as mock_spark_exec:
            request = ExecutionRequest(
                engine="spark_sql",
                command="SELECT c.name, t.value FROM customers c JOIN test_table t ON c.id = t.id",
                datasource_id="postgres-1",
                dataset_ids=[],
                context={"dataset_frames": {"dataset-1": dummy_df}}
            )
            response = await service.execute(mock_session, request)

            self.assertEqual(response.status, "SUCCESS")
            mock_spark_exec.assert_called_once()
            self.assertIn("dataset-1", response.dataset_ids)

    async def test_execution_service_timeout_handling(self) -> None:
        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        async def mock_refresh(obj):
            obj.id = "test-execution-id"
        mock_session.refresh = mock_refresh
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_session.execute.return_value = mock_result

        settings = RuntimeSettings()
        settings.execution.timeout_ms = 50

        service = ExecutionService(settings)

        async def slow_execute(*args, **kwargs):
            await asyncio.sleep(0.5)
            from app.services.execution.base import RawResult
            return RawResult(status="completed", columns=[], rows=[])

        with patch("app.services.execution.executors.get_settings", return_value=settings), \
             patch("app.services.execution.adapters.PostgresAdapter.execute_sql", side_effect=slow_execute):
            request = ExecutionRequest(
                engine="spark_sql",
                command="SELECT pg_sleep(2)",
                datasource_id="postgres-1",
                dataset_ids=[],
            )
            
            from app.core.config import ConfiguredDatasource
            settings.datasource.configured_connections = [
                ConfiguredDatasource(
                    id="postgres-1",
                    name="Postgres DB",
                    type="POSTGRESQL",
                    host="localhost",
                    port=5432,
                    database="workspace",
                    schema_name="public",
                    jdbc_url="postgresql://localhost",
                    runtime_managed=False,
                )
            ]

            response = await service.execute(mock_session, request)
            
            self.assertEqual(response.status, "FAILED")
            self.assertIsNotNone(response.error)
            self.assertIn("timed out", response.error["message"].lower())
            self.assertEqual(response.error["code"], "SQL_EXECUTION_ERROR")

    async def test_execution_service_truncation_and_structured_error(self) -> None:
        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        async def mock_refresh(obj):
            obj.id = "test-execution-id"
        mock_session.refresh = mock_refresh
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_session.execute.return_value = mock_result

        settings = RuntimeSettings()
        service = ExecutionService(settings)

        from app.services.execution.base import RawResult
        truncated_result = RawResult(
            status="completed",
            columns=["col"],
            rows=[{"col": 1}],
            truncated=True,
            statistics={"returnedRows": 1}
        )
        
        with patch("app.services.execution.executors.get_settings", return_value=settings), \
             patch("app.services.execution.adapters.PostgresAdapter.execute_sql", return_value=truncated_result):
            request = ExecutionRequest(
                engine="spark_sql",
                command="SELECT col FROM test",
                datasource_id="postgres-1",
                dataset_ids=[],
            )
            from app.core.config import ConfiguredDatasource
            settings.datasource.configured_connections = [
                ConfiguredDatasource(
                    id="postgres-1",
                    name="Postgres DB",
                    type="POSTGRESQL",
                    host="localhost",
                    port=5432,
                    database="workspace",
                    schema_name="public",
                    jdbc_url="postgresql://localhost",
                    runtime_managed=False,
                )
            ]
            response = await service.execute(mock_session, request)
            self.assertTrue(response.truncated)
            self.assertEqual(response.status, "SUCCESS")

        from app.services.execution.base import RawResult
        failed_result = RawResult(
            status="failed",
            error="Relation 'test' does not exist",
            logs=["ERROR:  relation \"test\" does not exist at character 15"]
        )
        
        with patch("app.services.execution.executors.get_settings", return_value=settings), \
             patch("app.services.execution.adapters.PostgresAdapter.execute_sql", return_value=failed_result):
            request = ExecutionRequest(
                engine="spark_sql",
                command="SELECT col FROM test",
                datasource_id="postgres-1",
                dataset_ids=[],
            )
            response = await service.execute(mock_session, request)
            self.assertEqual(response.status, "FAILED")
            self.assertIsNotNone(response.error)
            self.assertEqual(response.error["code"], "SQL_EXECUTION_ERROR")
            self.assertIn("Relation 'test' does not exist", response.error["message"])
            self.assertIn("relation \"test\" does not exist", response.error["details"])


if __name__ == "__main__":
    unittest.main()

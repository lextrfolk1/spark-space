from __future__ import annotations

import unittest
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
        with patch.object(service, "_build_dataset_context", return_value={
            "dataset_previews": {"dataset-1": [{"id": 1, "name": "Ada"}]},
            "dataset_schemas": {"dataset-1": [{"name": "id", "type": "int"}, {"name": "name", "type": "str"}]},
            "dataset_frames": {"dataset-1": dummy_df}
        }):
            request = ExecutionRequest(
                engine="spark_sql",
                command="SELECT name FROM customers",
                dataset_ids=[],
            )
            response = await service.execute(mock_session, request)

            self.assertEqual(response.status, "completed")
            self.assertIn("dataset-1", response.dataset_ids)
            self.assertEqual(response.rows, [{"name": "Ada"}])

    async def test_execution_service_skips_detection_when_datasource_provided(self) -> None:
        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        async def mock_refresh(obj):
            obj.id = "test-execution-id"
        mock_session.refresh = mock_refresh

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

        fake_df = pd.DataFrame([{"id": 10, "value": "live"}])
        with patch("app.services.execution.pipeline._execute_live_sql", return_value=(fake_df, {"returnedRows": 1})):
            request = ExecutionRequest(
                engine="spark_sql",
                command="SELECT value FROM test_table",
                datasource_id="postgres-1",
                dataset_ids=[],
            )
            response = await service.execute(mock_session, request)

            self.assertEqual(response.status, "completed")
            self.assertEqual(response.dataset_ids, [])
            self.assertEqual(response.rows, [{"id": 10, "value": "live"}])


if __name__ == "__main__":
    unittest.main()

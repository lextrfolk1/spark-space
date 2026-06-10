from __future__ import annotations

import unittest

import pandas as pd

from app.models.entities import DatasetRecord
from app.services.execution.pipeline import ExecutionPlan, SparkDataFrameExecutor, SparkSqlExecutor


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


if __name__ == "__main__":
    unittest.main()

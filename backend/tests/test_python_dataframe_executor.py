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

if __name__ == "__main__":
    unittest.main()

"""
ExecutorFactory — Factory pattern for selecting the correct executor.

Uses cellType, inputType, engine, and context to determine which
Executor implementation should handle a given request.

To register a new executor:
    factory = ExecutorFactory()
    factory.register("MY_NEW_TYPE", MyNewExecutor())
"""
from __future__ import annotations

from typing import Any

from app.services.execution.base import Executor


class ExecutorFactory:
    """
    Registry-based factory for execution engines.

    Selection priority:
    1. Exact match on cellType
    2. Match on inputType
    3. Match on engine from context
    4. Fallback to default executor
    """

    def __init__(self) -> None:
        self._executors_by_cell_type: dict[str, Executor] = {}
        self._executors_by_input_type: dict[str, Executor] = {}
        self._executors_by_engine: dict[str, Executor] = {}
        self._default: Executor | None = None

    def register(
        self,
        cell_type: str,
        executor: Executor,
        *,
        input_types: list[str] | None = None,
        engines: list[str] | None = None,
    ) -> None:
        """Register an executor for a cell type, optionally also for input types and engines."""
        self._executors_by_cell_type[cell_type.upper()] = executor
        if input_types:
            for it in input_types:
                self._executors_by_input_type[it.upper()] = executor
        if engines:
            for eng in engines:
                self._executors_by_engine[eng.lower()] = executor

    def set_default(self, executor: Executor) -> None:
        """Set the fallback executor used when no match is found."""
        self._default = executor

    def get_executor(
        self,
        cell_type: str,
        input_type: str = "",
        context: dict[str, Any] | None = None,
    ) -> Executor:
        """
        Select the correct executor for the given request parameters.

        Raises KeyError if no executor is found and no default is set.
        """
        # 1. Try cellType
        executor = self._executors_by_cell_type.get(cell_type.upper())
        if executor is not None:
            return executor

        # 2. Try inputType
        executor = self._executors_by_input_type.get(input_type.upper())
        if executor is not None:
            return executor

        # 3. Try engine from context
        if context:
            engine = context.get("engine", "")
            if engine:
                executor = self._executors_by_engine.get(engine.lower())
                if executor is not None:
                    return executor

        # 4. Fallback
        if self._default is not None:
            return self._default

        raise KeyError(
            f"No executor registered for cellType='{cell_type}', "
            f"inputType='{input_type}'. "
            f"Available cell types: {list(self._executors_by_cell_type.keys())}"
        )

    @property
    def registered_cell_types(self) -> list[str]:
        """List all registered cell types."""
        return list(self._executors_by_cell_type.keys())


_factory: ExecutorFactory | None = None


def get_executor_factory() -> ExecutorFactory:
    global _factory
    if _factory is None:
        _factory = ExecutorFactory()
        
        from app.services.execution.executors import SqlExecutor
        from app.services.execution.executors.markdown_executor import MarkdownExecutor
        from app.services.execution.executors.dataset_preview_executor import DatasetPreviewExecutor
        from app.services.execution.executors.natural_language_executor import NaturalLanguageExecutor
        
        sql_exec = SqlExecutor()
        _factory.register("SQL", sql_exec)
        _factory.register("SPARK_SQL", sql_exec)
        
        _factory.register("MARKDOWN", MarkdownExecutor())
        _factory.register("DATA_PREVIEW", DatasetPreviewExecutor())
        _factory.register("NATURAL_LANGUAGE", NaturalLanguageExecutor())
        
        _factory.set_default(sql_exec)
        
    return _factory

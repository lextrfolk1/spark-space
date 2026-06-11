"""
Base classes for the extensible execution framework.

This module defines the core abstractions that every execution engine must implement:
- Executor: The Strategy pattern interface with a 4-phase pipeline
- DataSourceAdapter: The Adapter pattern interface for different data sources
- ValidationResult, ExecutionPlan, RawResult: Value objects for the pipeline
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.schemas.notebooks import CellExecuteRequest, CellExecuteResponse


# ---------------------------------------------------------------------------
# Value objects for the execution pipeline
# ---------------------------------------------------------------------------

@dataclass
class ValidationResult:
    """Result of the validation phase."""
    valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    normalized_content: str | None = None


@dataclass
class ExecutionPlanV2:
    """
    Output of the planning phase. Contains everything needed to execute,
    including resolved datasets, connections, and the command to run.
    """
    engine: str
    command: str
    cell_type: str
    input_type: str
    datasets: list[Any] = field(default_factory=list)
    datasource: Any | None = None
    connection_config: dict[str, Any] = field(default_factory=dict)
    limit: int = 100
    context: dict[str, Any] = field(default_factory=dict)


@dataclass
class RawResult:
    """
    Raw output from the execution phase, before formatting.
    """
    status: str  # "completed" | "failed"
    columns: list[str] = field(default_factory=list)
    schema: list[dict[str, Any]] = field(default_factory=list)
    rows: list[dict[str, Any]] = field(default_factory=list)
    logs: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    error: str | None = None
    statistics: dict[str, Any] = field(default_factory=dict)
    result_type: str = "TABLE"
    generated_query: str | None = None


# ---------------------------------------------------------------------------
# Executor interface — Strategy pattern
# ---------------------------------------------------------------------------

class Executor(ABC):
    """
    Abstract base class for all execution engines.

    Each executor implements a 4-phase pipeline:
    1. validate(request) → check input validity
    2. plan(request) → resolve resources and create an execution plan
    3. execute(plan) → run the actual computation
    4. format_response(result) → convert raw result to DTO response

    To add a new execution engine:
    1. Create a new class that extends Executor
    2. Implement all four methods
    3. Register it in the ExecutorFactory
    """

    @abstractmethod
    async def validate(self, request: CellExecuteRequest) -> ValidationResult:
        """Validate the incoming request. Check syntax, permissions, etc."""
        ...

    @abstractmethod
    async def plan(self, request: CellExecuteRequest, **kwargs: Any) -> ExecutionPlanV2:
        """
        Create an execution plan by resolving datasets, connections,
        and preparing the command for execution.
        """
        ...

    @abstractmethod
    async def execute(self, plan: ExecutionPlanV2) -> RawResult:
        """Execute the plan and return raw results."""
        ...

    @abstractmethod
    async def format_response(self, result: RawResult, request: CellExecuteRequest) -> CellExecuteResponse:
        """Format the raw result into the standard DTO response."""
        ...

    async def run(self, request: CellExecuteRequest, **kwargs: Any) -> CellExecuteResponse:
        """
        Full pipeline execution: validate → plan → execute → format.
        Can be overridden if an executor needs custom orchestration.
        """
        validation = await self.validate(request)
        if not validation.valid:
            return CellExecuteResponse(
                execution_id="",
                status="FAILED",
                execution_type=request.cell_type,
                result_type="ERROR",
                error="; ".join(validation.errors),
                warnings=validation.warnings,
                logs=[f"Validation failed: {e}" for e in validation.errors],
            )

        plan = await self.plan(request, **kwargs)
        result = await self.execute(plan)
        return await self.format_response(result, request)


# ---------------------------------------------------------------------------
# DataSourceAdapter interface — Adapter pattern
# ---------------------------------------------------------------------------

class DataSourceAdapter(ABC):
    """
    Abstract base class for data source adapters.

    Each adapter encapsulates the connection and query logic for a
    specific database or data source type (PostgreSQL, MySQL, Spark, etc.)

    To add a new data source:
    1. Create a new class that extends DataSourceAdapter
    2. Implement connect(), execute_query(), get_schema(), disconnect()
    3. Register it in the AdapterRegistry
    """

    @abstractmethod
    async def connect(self, config: dict[str, Any]) -> None:
        """Establish a connection to the data source."""
        ...

    @abstractmethod
    async def execute_query(self, query: str, limit: int = 100) -> RawResult:
        """Execute a query against the data source."""
        ...

    @abstractmethod
    async def get_schema(self, table_name: str | None = None) -> list[dict[str, Any]]:
        """Get schema information for a table or the entire database."""
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        """Close the connection."""
        ...

    @abstractmethod
    def supports(self, datasource_type: str) -> bool:
        """Check if this adapter supports the given datasource type."""
        ...

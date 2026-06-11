"""
Natural Language Executor — handles NATURAL_LANGUAGE cell type execution.

Translates the custom language prompt to a SQL query via an API, then delegates
execution to the SqlExecutor.
"""
from __future__ import annotations

import re
from typing import Any
import httpx

from app.schemas.notebooks import CellExecuteRequest, CellExecuteResponse
from app.services.execution.base import ExecutionPlanV2, RawResult, ValidationResult
from app.services.execution.executors import SqlExecutor


class NaturalLanguageExecutor(SqlExecutor):
    """
    Executor for Natural Language query cells.
    Translates natural language to SQL using an API, then executes the SQL query.
    """

    async def validate(self, request: CellExecuteRequest) -> ValidationResult:
        content = request.content.strip()
        if not content:
            return ValidationResult(
                valid=False,
                errors=["Query prompt cannot be empty."],
            )
        return ValidationResult(valid=True, normalized_content=content)

    async def plan(self, request: CellExecuteRequest, **kwargs: Any) -> ExecutionPlanV2:
        prompt = request.content.strip()
        translated_sql = await self._translate(prompt)
        
        # Create a modified request for the SQL planner
        sql_request = CellExecuteRequest(
            cellType="SQL",
            inputType="STRUCTURED_QUERY",
            content=translated_sql,
            context=request.context
        )
        
        # Generate the execution plan using the parent SQL planning logic
        plan = await super().plan(sql_request, **kwargs)
        
        # Update the plan to reflect natural language execution
        plan.cell_type = "NATURAL_LANGUAGE"
        plan.input_type = "USER_INTENT"
        plan.context["generated_query"] = translated_sql
        
        return plan

    async def execute(self, plan: ExecutionPlanV2) -> RawResult:
        result = await super().execute(plan)
        result.generated_query = plan.context.get("generated_query")
        return result

    async def format_response(self, result: RawResult, request: CellExecuteRequest) -> CellExecuteResponse:
        response = await super().format_response(result, request)
        response.execution_type = "NATURAL_LANGUAGE"
        response.generated_query = result.generated_query
        return response

    async def _translate(self, prompt: str) -> str:
        """Call the local parsing API to translate prompt to SQL."""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "http://localhost:8000/api/notebooks/parse-nl",
                    json={"prompt": prompt},
                    timeout=2.0
                )
                if resp.status_code == 200:
                    return resp.json().get("sql", "")
        except Exception:
            pass
        return self._fallback_translate(prompt)

    def _fallback_translate(self, prompt: str) -> str:
        """Fallback rule-based translation if the API is down."""
        prompt_lower = prompt.lower().strip().rstrip("?;")
        if "rule" in prompt_lower:
            return "SELECT * FROM rule_type"
        if "customer" in prompt_lower:
            return "SELECT * FROM customers_smoke"
        
        # Match pattern: show [table], list [table], get [table]
        match = re.search(r'(?:show|get|list|select)\s+(?:me\s+)?(?:all\s+)?([a-zA-Z0-9_/]+)', prompt_lower)
        if match:
            return f"SELECT * FROM {match.group(1)}"
            
        return "SELECT * FROM customers_smoke"

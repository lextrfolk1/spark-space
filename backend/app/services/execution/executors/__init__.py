"""
SQL Executor — handles SQL cell type execution.

Delegates to the existing ExecutionService pipeline for actual SQL execution
(local SQLite, live PostgreSQL, Spark SQL) while implementing the new
4-phase Executor interface.
"""
from __future__ import annotations

import re
from typing import Any

from app.schemas.notebooks import CellExecuteRequest, CellExecuteResponse
from app.services.execution.base import (
    ExecutionPlanV2,
    Executor,
    RawResult,
    ValidationResult,
)

_READ_ONLY_SQL = re.compile(r"^\s*(select|with)\b", re.IGNORECASE)


class SqlExecutor(Executor):
    """
    Executor for SQL cell types. Supports:
    - Standard SQL (SELECT, WITH)
    - Parameterized queries (future)
    - Multiple SQL dialects via connection type
    """

    async def validate(self, request: CellExecuteRequest) -> ValidationResult:
        content = request.content.strip()

        if not content:
            return ValidationResult(
                valid=False,
                errors=["SQL command cannot be empty."],
            )

        if not _READ_ONLY_SQL.match(content):
            return ValidationResult(
                valid=False,
                errors=["Only read-only SELECT statements are supported. Use SELECT or WITH queries."],
                warnings=["DDL and DML statements are not supported in the notebook environment."],
            )

        return ValidationResult(
            valid=True,
            normalized_content=content,
        )

    async def plan(self, request: CellExecuteRequest, **kwargs: Any) -> ExecutionPlanV2:
        session = kwargs.get("session")
        context = request.context
        
        datasource_id = context.get("connectionId")
        if not datasource_id:
            datasource_id = "spark_local"
            
        datasource = None
        if datasource_id:
            from app.core.config import get_settings
            settings = get_settings()
            datasource = next(
                (item for item in settings.datasource.configured_connections if item.id == datasource_id),
                None,
            )
            if not datasource and session:
                from app.models.entities import DatasourceRecord
                datasource = await session.get(DatasourceRecord, datasource_id)
            
        connection_config = {}
        if datasource:
            from app.core.config import get_settings
            settings = get_settings()
            
            if hasattr(datasource, "encrypted_password"):
                from app.services.execution.pipeline import CredentialCipher
                cipher = CredentialCipher(settings.app_credential_key)
                password = cipher.decrypt(datasource.encrypted_password) if datasource.encrypted_password else ""
                connection_config = {
                    "host": datasource.host,
                    "port": datasource.port,
                    "username": datasource.username,
                    "password": password,
                    "database": datasource.database,
                    "schema_name": datasource.schema_name,
                }
            else:
                connection_config = {
                    "host": datasource.host,
                    "port": datasource.port,
                    "username": getattr(datasource, "username", None),
                    "password": getattr(datasource, "password", ""),
                    "database": datasource.database,
                    "schema_name": datasource.schema_name,
                }
            
        # Resolve referenced datasets
        datasets = []
        dataset_frames = {}
        plan_warnings = []
        if session:
            from app.models.entities import DatasetRecord
            from sqlalchemy import select
            
            stmt = select(DatasetRecord)
            result = await session.execute(stmt)
            all_datasets = result.scalars().all()
            
            import re
            from pathlib import Path
            import logging
            logger = logging.getLogger(__name__)
            
            detected_dataset_ids = []
            for ds in all_datasets:
                clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', ds.name)
                stem_name = Path(ds.name).stem
                clean_stem = re.sub(r'[^a-zA-Z0-9_]', '_', stem_name)
                
                names_to_check = {
                    ds.name,
                    clean_name,
                    stem_name,
                    clean_stem,
                    ds.name.lower(),
                    clean_name.lower(),
                    stem_name.lower(),
                    clean_stem.lower()
                }
                
                matched = False
                for name in names_to_check:
                    if not name:
                        continue
                    pattern = re.compile(rf"\b{re.escape(name)}\b", re.IGNORECASE)
                    if pattern.search(request.content):
                        matched = True
                        break
                        
                if matched and ds.id not in detected_dataset_ids:
                    datasets.append(ds)
                    detected_dataset_ids.append(ds.id)
                    
            from app.core.config import get_settings
            from app.services.storage.datasets import DatasetFileService
            
            settings = get_settings()
            file_service = DatasetFileService(settings)
            
            for dataset in datasets:
                metadata = dataset.metadata_json or {}
                try:
                    frame = file_service.load_dataframe(
                        dataset.location,
                        limit=settings.execution.max_rows,
                        delimiter=metadata.get("delimiter", ","),
                        has_header=metadata.get("has_header", True),
                    )
                    dataset_frames[dataset.id] = frame
                    dataset_frames[dataset.name] = frame
                except Exception as e:
                    logger.error(f"Failed to load dataset {dataset.name} from {dataset.location}: {e}", exc_info=True)
                    plan_warnings.append(f"Failed to load dataset '{dataset.name}': {e}")

        return ExecutionPlanV2(
            engine=context.get("engine", "spark_sql"),
            command=request.content.strip(),
            cell_type=request.cell_type,
            input_type=request.input_type,
            datasets=datasets,
            datasource=datasource,
            connection_config=connection_config,
            limit=context.get("limit", 100),
            context={
                **context,
                "dataset_frames": dataset_frames,
                "warnings": plan_warnings,
            },
        )

    async def execute(self, plan: ExecutionPlanV2) -> RawResult:
        from app.services.execution.adapters import AdapterRegistry
        
        if plan.datasource:
            datasource_type = plan.datasource.type
            config = {
                **plan.connection_config,
                "datasets": plan.datasets,
                "dataset_frames": plan.context.get("dataset_frames", {}),
            }
        else:
            datasource_type = "SQLITE"
            config = {
                "dataset_frames": plan.context.get("dataset_frames", {})
            }

        registry = AdapterRegistry()
        adapter = registry.get_adapter(datasource_type)
        
        plan_warnings = plan.context.get("warnings", [])
        
        try:
            await adapter.connect(config)
            result = await adapter.execute_query(plan.command, plan.limit)
            if plan_warnings:
                result.warnings = list(set(result.warnings + plan_warnings))
            return result
        except Exception as e:
            return RawResult(status="failed", error=str(e), warnings=plan_warnings)
        finally:
            await adapter.disconnect()

    async def format_response(self, result: RawResult, request: CellExecuteRequest) -> CellExecuteResponse:
        return CellExecuteResponse(
            execution_id="",
            status="SUCCESS" if result.status == "completed" else "FAILED",
            execution_type="SQL",
            result_type=result.result_type,
            generated_query=result.generated_query,
            columns=result.columns,
            schema=result.schema,
            rows=result.rows,
            row_count=len(result.rows),
            metadata=result.statistics,
            logs=result.logs,
            warnings=result.warnings,
            error=result.error,
        )

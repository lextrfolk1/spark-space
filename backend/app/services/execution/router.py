from __future__ import annotations

import re
from pathlib import Path
from typing import Any

class ExecutionRouter:
    @staticmethod
    def detect_referenced_datasets(query: str, all_datasets: list[Any]) -> list[Any]:
        """
        Scans a query command for references to registered dataset names.
        Returns the list of DatasetRecords referenced.
        """
        referenced = []
        query_stripped = query.strip()
        if not query_stripped:
            return referenced

        for ds in all_datasets:
            clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", ds.name)
            stem_name = Path(ds.name).stem
            clean_stem = re.sub(r"[^a-zA-Z0-9_]", "_", stem_name)

            names_to_check = {
                ds.name,
                clean_name,
                stem_name,
                clean_stem,
                ds.name.lower(),
                clean_name.lower(),
                stem_name.lower(),
                clean_stem.lower(),
            }

            matched = False
            for name in names_to_check:
                if not name:
                    continue
                # Word-boundary check to prevent matching substrings
                pattern = re.compile(rf"\b{re.escape(name)}\b", re.IGNORECASE)
                if pattern.search(query_stripped):
                    matched = True
                    break

            if matched:
                referenced.append(ds)

        return referenced

    @staticmethod
    def route_execution(
        cell_type: str,
        command: str,
        datasource: Any | None,
        datasets_referenced: list[Any],
        context: dict[str, Any]
    ) -> str:
        """
        Decides on the execution engine to run the command based on cell type,
        selected datasource, and local dataset usage.
        
        Returns one of: "sqlite", "postgresql", "spark_sql", "spark_dataframe"
        """
        cell_type_upper = cell_type.upper()
        
        if cell_type_upper in {"PYTHON_DATAFRAME", "DATAFRAME"}:
            return "spark_dataframe"
            
        if cell_type_upper == "SPARK_SQL":
            return "spark_sql"

        # SQL Mode
        if cell_type_upper == "SQL":
            if datasource is not None:
                datasource_type = getattr(datasource, "type", "").upper()
                if datasource_type in {"POSTGRES", "POSTGRESQL"}:
                    # If this is a cross-source query (references local datasets in query text), route to Spark.
                    if datasets_referenced:
                        return "spark_sql"
                    else:
                        # Direct execution against Postgres via asyncpg
                        return "postgresql"
                elif datasource_type in {"SPARK", "SPARK_SQL"}:
                    return "spark_sql"
            
            # If no remote datasource is selected, use SQLite for local datasets
            return "sqlite"

        # Default fallback
        return "spark_sql"

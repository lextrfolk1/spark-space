from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppConfig(BaseModel):
    name: str = "Execution Workspace"
    environment: str = "development"
    host: str = "0.0.0.0"
    port: int = 8000


class ExecutionConfig(BaseModel):
    timeout_ms: int = 60000
    max_rows: int = 1000
    default_limit: int = 100


class UploadConfig(BaseModel):
    enabled: bool = True
    max_file_size_mb: int = 100
    allowed_extensions: list[str] = Field(default_factory=lambda: ["csv", "json", "parquet"])


class ConfiguredDatasource(BaseModel):
    id: str
    name: str
    type: str
    host: str
    port: int
    database: str | None = None
    schema_name: str | None = None
    jdbc_url: str | None = None
    runtime_managed: bool = False


class DatasourceConfig(BaseModel):
    allow_runtime_creation: bool = True
    configured_connections: list[ConfiguredDatasource] = Field(default_factory=list)


class RuleEngineConfig(BaseModel):
    enabled: bool = False


class StorageConfig(BaseModel):
    provider: str = "local"
    bucket: str = "datasets"
    local_path: str = "./backend/data/storage"
    upload_path: str = "./backend/data/uploads"


class RuntimeSettings(BaseModel):
    app: AppConfig = Field(default_factory=AppConfig)
    execution: ExecutionConfig = Field(default_factory=ExecutionConfig)
    upload: UploadConfig = Field(default_factory=UploadConfig)
    datasource: DatasourceConfig = Field(default_factory=DatasourceConfig)
    rule_engine: RuleEngineConfig = Field(default_factory=RuleEngineConfig)
    storage: StorageConfig = Field(default_factory=StorageConfig)
    database_url: str = "postgresql+asyncpg://workspace:workspace@postgres:5432/workspace"
    app_credential_key: str = "change-me-with-32-byte-base64-key"


class EnvironmentSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str | None = None
    app_env: str | None = None
    app_host: str | None = None
    app_port: int | None = None
    database_url: str | None = None
    execution_timeout_ms: int | None = None
    execution_max_rows: int | None = None
    execution_default_limit: int | None = None
    upload_enabled: bool | None = None
    upload_max_file_size_mb: int | None = None
    runtime_datasource_allow_creation: bool | None = None
    rule_engine_enabled: bool | None = None
    object_storage_provider: str | None = None
    object_storage_bucket: str | None = None
    local_storage_path: str | None = None
    upload_path: str | None = None
    app_credential_key: str | None = None
    config_file: str | None = None


def _deep_merge(base: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _load_yaml(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    config_path = Path(path)
    if not config_path.exists():
        return {}
    with config_path.open("r", encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle) or {}
    return loaded if isinstance(loaded, dict) else {}


def _environment_overlay(env: EnvironmentSettings) -> dict[str, Any]:
    overlay: dict[str, Any] = {}

    if env.app_name or env.app_env or env.app_host or env.app_port:
        overlay["app"] = {
            key: value
            for key, value in {
                "name": env.app_name,
                "environment": env.app_env,
                "host": env.app_host,
                "port": env.app_port,
            }.items()
            if value is not None
        }

    if (
        env.execution_timeout_ms is not None
        or env.execution_max_rows is not None
        or env.execution_default_limit is not None
    ):
        overlay["execution"] = {
            key: value
            for key, value in {
                "timeout_ms": env.execution_timeout_ms,
                "max_rows": env.execution_max_rows,
                "default_limit": env.execution_default_limit,
            }.items()
            if value is not None
        }

    if env.upload_enabled is not None or env.upload_max_file_size_mb is not None:
        overlay["upload"] = {
            key: value
            for key, value in {
                "enabled": env.upload_enabled,
                "max_file_size_mb": env.upload_max_file_size_mb,
            }.items()
            if value is not None
        }

    if env.runtime_datasource_allow_creation is not None:
        overlay["datasource"] = {
            "allow_runtime_creation": env.runtime_datasource_allow_creation,
        }

    if env.rule_engine_enabled is not None:
        overlay["rule_engine"] = {"enabled": env.rule_engine_enabled}

    if env.object_storage_provider or env.object_storage_bucket or env.local_storage_path or env.upload_path:
        overlay["storage"] = {
            key: value
            for key, value in {
                "provider": env.object_storage_provider,
                "bucket": env.object_storage_bucket,
                "local_path": env.local_storage_path,
                "upload_path": env.upload_path,
            }.items()
            if value is not None
        }

    if env.database_url is not None:
        overlay["database_url"] = env.database_url
    if env.app_credential_key is not None:
        overlay["app_credential_key"] = env.app_credential_key

    return overlay


@lru_cache(maxsize=1)
def get_settings() -> RuntimeSettings:
    env = EnvironmentSettings()
    config_file = env.config_file or os.getenv("CONFIG_FILE") or "config/application.yml"
    yaml_config = _load_yaml(config_file)
    merged = _deep_merge(yaml_config, _environment_overlay(env))
    return RuntimeSettings.model_validate(merged)


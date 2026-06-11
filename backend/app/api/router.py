from fastapi import APIRouter

from app.api import datasources, datasets, executions, logs, notebooks

api_router = APIRouter(prefix="/api")
api_router.include_router(notebooks.router, prefix="/notebooks", tags=["notebooks"])
api_router.include_router(datasources.router, prefix="/datasources", tags=["datasources"])
api_router.include_router(datasets.router, prefix="/datasets", tags=["datasets"])
api_router.include_router(executions.router, tags=["executions"])
api_router.include_router(logs.router, prefix="/logs", tags=["logs"])



from __future__ import annotations

import asyncio
import socket

from app.schemas.datasources import DatasourceTestRequest, DatasourceTestResponse


async def test_connection(payload: DatasourceTestRequest) -> DatasourceTestResponse:
    try:
        await asyncio.to_thread(socket.create_connection, (payload.host, payload.port), 3)
    except OSError as exc:
        return DatasourceTestResponse(success=False, message=f"Connection failed: {exc}")
    return DatasourceTestResponse(success=True, message="Connection succeeded")


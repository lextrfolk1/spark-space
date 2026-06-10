from __future__ import annotations

import asyncio
import socket

from app.schemas.datasources import DatasourceTestRequest, DatasourceTestResponse


def _candidate_hosts(host: str) -> list[str]:
    normalized = host.strip()
    candidates = [normalized]
    if normalized in {"localhost", "127.0.0.1", "::1"}:
        candidates.append("host.docker.internal")
    return candidates


async def test_connection(payload: DatasourceTestRequest) -> DatasourceTestResponse:
    last_error: OSError | None = None
    for host in _candidate_hosts(payload.host):
        try:
            connection = await asyncio.to_thread(socket.create_connection, (host, payload.port), 3)
            connection.close()
            if host != payload.host:
                return DatasourceTestResponse(
                    success=True,
                    message=(
                        f"Connection succeeded via `{host}`. "
                        "When the backend runs in Docker, use `host.docker.internal` instead of `localhost` for services on your machine."
                    ),
                )
            return DatasourceTestResponse(success=True, message="Connection succeeded")
        except OSError as exc:
            last_error = exc

    if payload.host in {"localhost", "127.0.0.1", "::1"} and last_error is not None:
        return DatasourceTestResponse(
            success=False,
            message=(
                f"Connection failed: {last_error}. "
                "The backend runs inside Docker, so `localhost` points to the container. "
                "Use `host.docker.internal` for services running on your machine."
            ),
        )

    return DatasourceTestResponse(success=False, message=f"Connection failed: {last_error}")

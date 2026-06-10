from __future__ import annotations

from collections import deque
from datetime import datetime

from app.schemas.logs import LogEntry


class LogBook:
    def __init__(self, max_entries: int = 500) -> None:
        self._entries: deque[LogEntry] = deque(maxlen=max_entries)

    def add(self, source: str, level: str, message: str) -> None:
        self._entries.appendleft(
            LogEntry(timestamp=datetime.utcnow(), level=level.upper(), source=source, message=message)
        )

    def list(self) -> list[LogEntry]:
        return list(self._entries)


log_book = LogBook()


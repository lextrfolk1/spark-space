from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class LogEntry(BaseModel):
    timestamp: datetime
    level: str
    source: str
    message: str


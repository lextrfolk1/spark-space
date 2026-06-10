from fastapi import APIRouter

from app.schemas.logs import LogEntry
from app.services.logbook import log_book

router = APIRouter()


@router.get("", response_model=list[LogEntry])
async def get_logs() -> list[LogEntry]:
    return log_book.list()


from __future__ import annotations

import logging
from pyspark.sql import SparkSession

logger = logging.getLogger(__name__)

class SparkSessionManager:
    _instance: SparkSessionManager | None = None
    _sessions: dict[str, SparkSession] = {}

    @classmethod
    def get_instance(cls) -> SparkSessionManager:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_session(self, host: str, port: int, app_name: str = "execution-workspace") -> SparkSession:
        remote = f"sc://{host}:{port}"
        
        # Check if session is cached and healthy
        if remote in self._sessions:
            session = self._sessions[remote]
            try:
                # Ping Spark to confirm active connection
                session.sql("SELECT 1").collect()
                return session
            except Exception as e:
                logger.warning(f"Cached Spark session for {remote} is disconnected or unhealthy: {e}. Re-establishing session.")
                self._sessions.pop(remote, None)

        logger.info(f"Connecting to remote Spark Connect server at {remote}")
        try:
            builder = SparkSession.builder.remote(remote).appName(app_name)
            session = builder.getOrCreate()
            # Verify the newly created session
            session.sql("SELECT 1").collect()
            self._sessions[remote] = session
            return session
        except Exception as e:
            logger.error(f"Failed to establish Spark Connect session at {remote}: {e}")
            raise ConnectionError(f"Could not connect to Spark Connect server at {remote}: {e}") from e

    def close_all(self) -> None:
        for remote, session in list(self._sessions.items()):
            try:
                session.stop()
            except Exception as e:
                logger.warning(f"Failed to stop Spark session for {remote}: {e}")
        self._sessions.clear()

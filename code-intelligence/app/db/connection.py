"""Postgres connection pool.

Every physical connection is configured once, at checkout time, to load
the AGE extension and put its catalog on the search path - so any code
that grabs a connection from the pool can immediately issue `cypher(...)`
calls without repeating that setup itself.
"""

from __future__ import annotations

import atexit
from contextlib import contextmanager

from pgvector.psycopg import register_vector
from psycopg_pool import ConnectionPool

from app.config import settings

_pool: ConnectionPool | None = None


def _configure_connection(conn) -> None:
    register_vector(conn)
    with conn.cursor() as cur:
        cur.execute("LOAD 'age'")
        cur.execute('SET search_path = ag_catalog, "$user", public')
    conn.commit()


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            settings.database_url,
            min_size=1,
            max_size=10,
            configure=_configure_connection,
            open=True,
        )
        atexit.register(close_pool)
    return _pool


@contextmanager
def get_connection():
    with get_pool().connection() as conn:
        yield conn


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None

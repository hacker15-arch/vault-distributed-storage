import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict, Optional

logger = logging.getLogger("vault.lock_manager")


class AsyncRWLock:
    """Asynchronous Readers-Writer lock with writer priority and timeout support."""

    def __init__(self):
        self._readers: int = 0
        self._writer_active: bool = False
        self._waiting_writers: int = 0
        self._condition = asyncio.Condition()
        self.ref_count: int = 0

    async def acquire_read(self, timeout: Optional[float] = None) -> bool:
        """Acquire a shared read lock."""
        async with self._condition:
            async def _wait_for_read():
                while self._writer_active or self._waiting_writers > 0:
                    await self._condition.wait()
                self._readers += 1

            if timeout is not None:
                try:
                    await asyncio.wait_for(_wait_for_read(), timeout=timeout)
                except asyncio.TimeoutError:
                    raise TimeoutError("Timed out waiting to acquire read lock")
            else:
                await _wait_for_read()
            return True

    async def release_read(self) -> None:
        """Release a shared read lock."""
        async with self._condition:
            self._readers -= 1
            if self._readers == 0:
                self._condition.notify_all()

    async def acquire_write(self, timeout: Optional[float] = None) -> bool:
        """Acquire an exclusive write lock."""
        async with self._condition:
            self._waiting_writers += 1
            try:
                async def _wait_for_write():
                    while self._writer_active or self._readers > 0:
                        await self._condition.wait()
                    self._writer_active = True

                if timeout is not None:
                    try:
                        await asyncio.wait_for(_wait_for_write(), timeout=timeout)
                    except asyncio.TimeoutError:
                        raise TimeoutError("Timed out waiting to acquire write lock")
                else:
                    await _wait_for_write()
                return True
            finally:
                self._waiting_writers -= 1

    async def release_write(self) -> None:
        """Release an exclusive write lock."""
        async with self._condition:
            self._writer_active = False
            self._condition.notify_all()


class LockManager:
    """Manages granular per-object reader-writer locks with automatic memory cleanup."""

    def __init__(self, default_timeout: float = 10.0):
        self._locks: Dict[str, AsyncRWLock] = {}
        self._lock_meta_lock = asyncio.Lock()
        self.default_timeout = default_timeout

    async def _get_or_create_lock(self, key: str) -> AsyncRWLock:
        async with self._lock_meta_lock:
            if key not in self._locks:
                self._locks[key] = AsyncRWLock()
            lock = self._locks[key]
            lock.ref_count += 1
            return lock

    async def _cleanup_lock(self, key: str, lock: AsyncRWLock) -> None:
        async with self._lock_meta_lock:
            lock.ref_count -= 1
            if lock.ref_count <= 0 and not lock._writer_active and lock._readers == 0:
                self._locks.pop(key, None)

    @asynccontextmanager
    async def read_lock(self, key: str, timeout: Optional[float] = None):
        """Context manager to acquire a shared read lock for a specific object key."""
        t = timeout if timeout is not None else self.default_timeout
        lock = await self._get_or_create_lock(key)
        try:
            await lock.acquire_read(timeout=t)
            logger.debug("Acquired read lock for '%s'", key)
            try:
                yield
            finally:
                await lock.release_read()
                logger.debug("Released read lock for '%s'", key)
        finally:
            await self._cleanup_lock(key, lock)

    @asynccontextmanager
    async def write_lock(self, key: str, timeout: Optional[float] = None):
        """Context manager to acquire an exclusive write lock for a specific object key."""
        t = timeout if timeout is not None else self.default_timeout
        lock = await self._get_or_create_lock(key)
        try:
            await lock.acquire_write(timeout=t)
            logger.debug("Acquired write lock for '%s'", key)
            try:
                yield
            finally:
                await lock.release_write()
                logger.debug("Released write lock for '%s'", key)
        finally:
            await self._cleanup_lock(key, lock)

    def active_lock_count(self) -> int:
        """Return the number of active key locks currently allocated in memory."""
        return len(self._locks)


lock_manager = LockManager()

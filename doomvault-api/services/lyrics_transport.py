"""Bounded, cancellable LRCLIB work, independent of WSGI disconnect detection."""
import asyncio
import re
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field

import httpx

MAX_BODY_BYTES = 1_048_576
MAX_REQUEST_SECONDS = 15
_slots = threading.BoundedSemaphore(2)
_lock = threading.Lock()
_active = {}
_cancelled = OrderedDict()


class LyricsCancelled(Exception):
    pass


class LyricsBusy(Exception):
    pass


@dataclass
class LyricsJob:
    identifier: str
    deadline: float
    cancelled: threading.Event = field(default_factory=threading.Event)


def valid_request_id(identifier):
    return isinstance(identifier, str) and re.fullmatch(r"[A-Za-z0-9-]{16,64}", identifier) is not None


def start_job(identifier, seconds):
    with _lock:
        now = time.monotonic()
        while _cancelled and next(iter(_cancelled.values())) <= now:
            _cancelled.popitem(last=False)
        if identifier in _cancelled:
            raise LyricsCancelled()
        if identifier in _active or not _slots.acquire(blocking=False):
            raise LyricsBusy()
        job = LyricsJob(identifier, now + min(seconds, MAX_REQUEST_SECONDS))
        _active[identifier] = job
        return job


def finish_job(job):
    with _lock:
        if _active.get(job.identifier) is job:
            del _active[job.identifier]
            _slots.release()


def cancel_job(identifier):
    with _lock:
        job = _active.get(identifier)
        if job:
            job.cancelled.set()
        else:
            # A cancellation POST may arrive before the original GET.
            _cancelled.pop(identifier, None)
            _cancelled[identifier] = time.monotonic() + 30
            while len(_cancelled) > 256:
                _cancelled.popitem(last=False)


async def _download(url, params, headers):
    async with httpx.AsyncClient(timeout=httpx.Timeout(12, connect=4), follow_redirects=False) as client:
        async with client.stream("GET", url, params=params, headers=headers) as response:
            content = bytearray()
            if response.status_code == 200:
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_BODY_BYTES:
                        raise ValueError("LRCLIB response too large")
            # The upstream socket is closed before control returns to the Flask route.
            headers = {key: value for key, value in response.headers.items()
                       if key not in ("content-encoding", "content-length")}
            return httpx.Response(response.status_code, headers=headers, content=bytes(content))


async def _run(job, url, params, headers):
    task = asyncio.create_task(_download(url, params, headers))
    try:
        while True:
            if job.cancelled.is_set():
                raise LyricsCancelled()
            remaining = job.deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError()
            done, _ = await asyncio.wait({task}, timeout=min(0.05, remaining))
            if task in done:
                # Recheck cancellation/deadline before accepting a just-completed download.
                if job.cancelled.is_set():
                    raise LyricsCancelled()
                if time.monotonic() >= job.deadline:
                    raise TimeoutError()
                return task.result()
    finally:
        if not task.done():
            task.cancel()
        await asyncio.gather(task, return_exceptions=True)


def fetch_lyrics_response(url, *, params, headers, job):
    return asyncio.run(_run(job, url, params, headers))

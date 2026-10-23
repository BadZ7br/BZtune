"""Exercise cancellation/deadlines against real local HTTP streams, not mocked reads."""
import asyncio
import gzip
import json
import select
import socket
import sys
import threading
import time
import unittest
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from flask import Flask

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'doomvault-api'))
from services.lyrics_transport import (LyricsCancelled, fetch_lyrics_response, start_job, finish_job)
from api.lyrics_api import lyrics_bp


class Provider(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        # Capture events per request: a delayed handler must not signal a later request.
        started, disconnected = self.server.started, self.server.disconnected
        on_request = getattr(self.server, 'on_request', None)
        finished = threading.Event()
        def observe_peer():
            while not finished.is_set():
                try:
                    readable, _, _ = select.select([self.connection], [], [], .02)
                    if readable and not self.connection.recv(1, socket.MSG_PEEK):
                        disconnected.set()
                        return
                except OSError:
                    if not finished.is_set():
                        disconnected.set()
                    return
        # On Windows a tiny write can be buffered after the peer closes. Observe EOF
        # directly rather than requiring that a subsequent write raises BrokenPipeError.
        observer = threading.Thread(target=observe_peer, daemon=True)
        observer.start()
        if on_request:
            on_request()
        started.set()
        try:
            if self.path.startswith('/headers'):
                time.sleep(.6)
            self.send_response(200)
            if self.path.startswith('/gzip'):
                body = gzip.compress(json.dumps({'plainLyrics': 'x' * self.server.body_size}).encode())
                self.send_header('Content-Encoding', 'gzip')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif self.path.startswith('/trickle'):
                self.end_headers()
                for _ in range(100):
                    self.wfile.write(b' ')
                    self.wfile.flush()
                    time.sleep(.02)
            else:
                self.end_headers()
                self.wfile.write(b'{"plainLyrics":"Words"}')
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            disconnected.set()
        finally:
            finished.set()
            observer.join(.2)


class LyricsTransportTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Provider)
        self.server.started = threading.Event()
        self.server.disconnected = threading.Event()
        self.server.body_size = 100
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': .01}, daemon=True)
        self.thread.start()
        app = Flask(__name__)
        app.register_blueprint(lyrics_bp)
        self.client = app.test_client()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(2)

    def download(self, job, path):
        return fetch_lyrics_response(f'http://127.0.0.1:{self.server.server_port}/{path}', params={}, headers={}, job=job)

    def test_deadline_interrupts_slow_headers_and_continuous_trickle_and_releases_socket(self):
        for path in ['headers', 'trickle']:
            with self.subTest(path=path):
                self.server.started = threading.Event()
                self.server.disconnected = threading.Event()
                # Cold HTTP client initialization can exceed 250 ms on Windows.
                # Allow setup, then exercise the short deadline against an actual
                # connected provider. The total setup deadline has its own test.
                job = start_job(str(uuid.uuid4()), 2)
                connected_at = []
                def arm_deadline(job=job, connected_at=connected_at):
                    connected_at.append(time.monotonic())
                    job.deadline = connected_at[0] + .25
                self.server.on_request = arm_deadline
                started = time.monotonic()
                try:
                    with self.assertRaises(TimeoutError):
                        self.download(job, path)
                finally:
                    self.server.on_request = None
                    finish_job(job)
                self.assertLess(time.monotonic() - started, 2.9)
                self.assertTrue(self.server.started.is_set())
                self.assertGreaterEqual(time.monotonic() - connected_at[0], .2)
                self.assertLess(time.monotonic() - connected_at[0], .9)
                self.assertTrue(self.server.disconnected.wait(1.5), 'upstream must observe the closed connection')

    def test_total_deadline_cancels_work_before_a_connection_starts(self):
        stopped = threading.Event()
        async def blocked_setup(*args):
            try:
                await asyncio.Event().wait()
            finally:
                stopped.set()
        job = start_job(str(uuid.uuid4()), .05)
        started = time.monotonic()
        try:
            with patch('services.lyrics_transport._download', blocked_setup):
                with self.assertRaises(TimeoutError):
                    self.download(job, 'ok')
        finally:
            finish_job(job)
        self.assertLess(time.monotonic() - started, .8)
        self.assertTrue(stopped.is_set(), 'cancelled setup must finish before returning')
        self.assertFalse(self.server.started.is_set(), 'setup timeout must not reach the provider')
        next_job = start_job(str(uuid.uuid4()), 2)
        finish_job(next_job)

    def test_peer_observer_keeps_an_open_stream_active_and_detects_actual_close(self):
        peer = socket.create_connection(('127.0.0.1', self.server.server_port), timeout=2)
        try:
            peer.sendall(b'GET /trickle HTTP/1.0\r\nHost: localhost\r\n\r\n')
            self.assertTrue(self.server.started.wait(2))
            self.assertFalse(self.server.disconnected.wait(.1), 'an open connection must not be reported as closed')
            peer.shutdown(socket.SHUT_RDWR)
            peer.close()
            self.assertTrue(self.server.disconnected.wait(1), 'EOF must be observed without waiting for a failed write')
        finally:
            peer.close()

    def test_explicit_cancellation_during_stream_stops_work_and_releases_slot(self):
        identifier = str(uuid.uuid4())
        job = start_job(identifier, 10)
        errors = []
        def run():
            try:
                self.download(job, 'trickle')
            except Exception as error:
                errors.append(error)
            finally:
                finish_job(job)
        worker = threading.Thread(target=run, daemon=True)
        worker.start()
        self.assertTrue(self.server.started.wait(2))
        started = time.monotonic()
        self.assertEqual(self.client.post('/api/lyrics/cancel/' + identifier).status_code, 204)
        worker.join(1)
        self.assertFalse(worker.is_alive())
        self.assertLess(time.monotonic() - started, .8)
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], LyricsCancelled)
        self.assertTrue(self.server.disconnected.wait(1))
        next_job = start_job(str(uuid.uuid4()), 2)
        try:
            response = self.download(next_job, 'ok')
            self.assertEqual(response.json()['plainLyrics'], 'Words')
        finally:
            finish_job(next_job)

    def test_cancellation_before_get_and_bounded_concurrency_do_not_call_provider(self):
        identifier = str(uuid.uuid4())
        self.assertEqual(self.client.post('/api/lyrics/cancel/' + identifier).status_code, 204)
        query = '/api/lyrics?track_name=Song&artist_name=Artist&request_id='
        with patch('api.lyrics_api.fetch_lyrics_response') as download:
            self.assertEqual(self.client.get(query + identifier).status_code, 409)
            jobs = [start_job(str(uuid.uuid4()), 2) for _ in range(2)]
            try:
                self.assertEqual(self.client.get(query + str(uuid.uuid4())).status_code, 503)
            finally:
                for job in jobs:
                    finish_job(job)
            download.assert_not_called()
        self.assertEqual(self.client.post('/api/lyrics/cancel/invalid').status_code, 400)
        for extra in ['&timeout_ms=0', '&timeout_ms=15001', '&timeout_ms=nan', '&request_id=bad']:
            self.assertEqual(self.client.get('/api/lyrics?track_name=Song&artist_name=Artist' + extra).status_code, 400)

    def test_gzip_is_decoded_once_and_limit_applies_to_decompressed_bytes(self):
        for size in [100, 1_048_576]:
            self.server.body_size = size
            job = start_job(str(uuid.uuid4()), 2)
            try:
                if size == 100:
                    response = self.download(job, 'gzip')
                    self.assertEqual(response.json()['plainLyrics'], 'x' * 100)
                else:
                    with self.assertRaisesRegex(ValueError, 'too large'):
                        self.download(job, 'gzip')
            finally:
                finish_job(job)

"""Validate the real Flask route without starting workers or external requests."""
import sys
from pathlib import Path
import unittest
from unittest.mock import patch
from flask import Flask
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'doomvault-api'))
from api import auto_catalog_api as auto


class AutoDownloadValidationTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(auto.auto_catalog_bp)
        self.client = app.test_client()
        batches = patch.object(auto, 'BATCHES', {})
        thread = patch.object(auto.threading, 'Thread')
        self.batches = batches.start()
        self.thread = thread.start()
        self.addCleanup(batches.stop)
        self.addCleanup(thread.stop)
        self.valid = {'artist': 'Artist', 'title': 'Song', 'kind': 'track', 'videoId': 'abcdefghijk'}

    def test_non_object_and_missing_json_return_400_without_work(self):
        for payload in (None, [1], 'bad', 42, [], {}):
            with self.subTest(payload=payload):
                response = self.client.post('/api/library/auto-download', json=payload)
                self.assertEqual(response.status_code, 400)
                self.assertIsInstance(response.get_json()['error'], str)
        self.assertEqual(self.batches, {})
        self.thread.assert_not_called()

    def test_invalid_metadata_and_optional_identifiers_never_start_work(self):
        for patch_data in ({'artist': None}, {'title': 42}, {'artist': []}, {'title': ' '},
                           {'title': 'x' * 201}, {'kind': {}}, {'videoId': 'invalid'},
                           {'videoId': 42}, {'albumId': {}}, {'albumId': ' '},
                           {'albumId': 'x' * 201}, {'albumId': 'bad\nvalue'}):
            with self.subTest(patch=patch_data):
                response = self.client.post('/api/library/auto-download', json={**self.valid, **patch_data})
                self.assertEqual(response.status_code, 400)
                self.assertIsInstance(response.get_json()['error'], str)
        self.assertEqual(self.batches, {})
        self.thread.assert_not_called()

    def test_valid_track_release_fallback_and_capacity_remain_supported(self):
        track = self.client.post('/api/library/auto-download', json={**self.valid, 'artist': ' Artist '})
        self.assertEqual(track.status_code, 202)
        self.assertEqual(self.thread.call_args.kwargs['args'][1:4], ('Artist', 'Song', 'track'))
        for payload in ({'artist': 'Artist', 'title': 'Album', 'kind': 'release', 'albumId': 'MPRE-album'},
                        {'artist': 'Artist', 'title': 'Song 2', 'kind': 'track', 'videoId': None, 'albumId': None}):
            self.assertEqual(self.client.post('/api/library/auto-download', json=payload).status_code, 202)
        self.assertEqual(self.client.post('/api/library/auto-download', json=self.valid).status_code, 429)
        self.assertEqual(len(self.batches), 3)
        self.assertEqual(self.thread.call_count, 3)

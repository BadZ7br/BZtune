import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from flask import Flask
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'doomvault-api'))
from api.lyrics_api import lyrics_bp


class LyricsTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(lyrics_bp)
        self.client = app.test_client()
        self.query = '/api/lyrics?track_name=Song&artist_name=Artist&album_name=Album&duration=123'

    @patch('api.lyrics_api.requests.get')
    def test_synced_and_plain(self, get):
        get.return_value = Mock(status_code=200)
        get.return_value.iter_content.return_value = [json.dumps(dict(syncedLyrics='[00:01.00]Hello', plainLyrics='Hello', instrumental=False)).encode()]
        response = self.client.get(self.query)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['syncedLyrics'], '[00:01.00]Hello')
        self.assertEqual(get.call_args.kwargs['params']['duration'], 123)
        self.assertFalse(get.call_args.kwargs['allow_redirects'])

    @patch('api.lyrics_api.requests.get')
    def test_plain_and_instrumental(self, get):
        for payload in [dict(plainLyrics='Hello'), dict(instrumental=True)]:
            get.return_value = Mock(status_code=200)
            get.return_value.iter_content.return_value = [json.dumps(payload).encode()]
            self.assertEqual(self.client.get(self.query).status_code, 200)

    @patch('api.lyrics_api.requests.get')
    def test_not_found_and_upstream_failure(self, get):
        for upstream, expected in [(404, 404), (429, 502), (302, 502)]:
            get.return_value = Mock(status_code=upstream)
            self.assertEqual(self.client.get(self.query).status_code, expected)
        get.side_effect = requests.Timeout()
        self.assertEqual(self.client.get(self.query).status_code, 504)

    @patch('api.lyrics_api.requests.get')
    def test_invalid_metadata_never_calls_upstream(self, get):
        for query in ['/api/lyrics', '/api/lyrics?track_name=X&artist_name=Y&duration=nan', self.query + '9999999']:
            self.assertEqual(self.client.get(query).status_code, 400)
        get.assert_not_called()

    @patch('api.lyrics_api.requests.get')
    def test_bad_or_empty_response(self, get):
        for payload, status in [(None, 502), ({'plainLyrics': 42}, 502), ({'plainLyrics': 'x' * 250001}, 502), ({}, 404)]:
            get.return_value = Mock(status_code=200)
            get.return_value.iter_content.return_value = [json.dumps(payload).encode()]
            self.assertEqual(self.client.get(self.query).status_code, status)

    @patch('api.lyrics_api.requests.get')
    def test_response_limit_is_checked_before_json_and_closes_connection(self, get):
        response = get.return_value = Mock(status_code=200)
        def chunks(**kwargs):
            yield b' ' * 1_048_576
            yield b'x'
            raise AssertionError('must stop reading at the limit')
        response.iter_content.side_effect = chunks
        self.assertEqual(self.client.get(self.query).status_code, 502)
        response.close.assert_called_once()
        self.assertTrue(get.call_args.kwargs['stream'])

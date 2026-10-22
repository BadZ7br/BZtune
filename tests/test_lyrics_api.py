import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from flask import Flask
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'doomvault-api'))
from api.lyrics_api import lyrics_bp


class LyricsTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(lyrics_bp)
        self.client = app.test_client()
        self.query = '/api/lyrics?track_name=Song&artist_name=Artist&album_name=Album&duration=123'

    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_synced_and_plain(self, get):
        get.return_value = Mock(status_code=200)
        get.return_value.iter_bytes.return_value = [json.dumps(dict(syncedLyrics='[00:01.00]Hello', plainLyrics='Hello', instrumental=False)).encode()]
        response = self.client.get(self.query)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['syncedLyrics'], '[00:01.00]Hello')
        self.assertEqual(get.call_args.kwargs['params']['duration'], 123)

    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_plain_and_instrumental(self, get):
        for payload in [dict(plainLyrics='Hello'), dict(instrumental=True)]:
            get.return_value = Mock(status_code=200)
            get.return_value.iter_bytes.return_value = [json.dumps(payload).encode()]
            self.assertEqual(self.client.get(self.query).status_code, 200)

    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_not_found_and_upstream_failure(self, get):
        for upstream, expected in [(404, 404), (429, 429), (302, 502)]:
            get.return_value = Mock(status_code=upstream)
            self.assertEqual(self.client.get(self.query).status_code, expected)
        get.side_effect = httpx.ReadTimeout("slow")
        self.assertEqual(self.client.get(self.query).status_code, 504)

    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_invalid_metadata_never_calls_upstream(self, get):
        for query in ['/api/lyrics', '/api/lyrics?track_name=X&artist_name=Y&duration=nan', self.query + '9999999']:
            self.assertEqual(self.client.get(query).status_code, 400)
        get.assert_not_called()

    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_bad_or_empty_response(self, get):
        for payload, status in [(None, 502), ({'plainLyrics': 42}, 502), ({'plainLyrics': 'x' * 250001}, 502), ({}, 404)]:
            get.return_value = Mock(status_code=200)
            get.return_value.iter_bytes.return_value = [json.dumps(payload).encode()]
            self.assertEqual(self.client.get(self.query).status_code, status)

    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_response_limit_is_checked_before_json_and_closes_connection(self, get):
        response = get.return_value = Mock(status_code=200)
        def chunks(**kwargs):
            yield b' ' * 1_048_576
            yield b'x'
            raise AssertionError('must stop reading at the limit')
        response.iter_bytes.side_effect = chunks
        self.assertEqual(self.client.get(self.query).status_code, 502)
        response.close.assert_called_once()
        self.assertIsNotNone(get.call_args.kwargs['job'])


    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_search_lists_recordings_without_restricting_album_or_duration(self, get):
        row = dict(id=10, trackName='Song', artistName='Artist', albumName='Studio', duration=123.5, syncedLyrics='[00:01]Studio')
        live = dict(row, id=11, albumName='Live', duration=180, syncedLyrics=None, plainLyrics='Live text')
        get.return_value = Mock(status_code=200)
        get.return_value.iter_bytes.return_value = [json.dumps([row, live, row, dict(row, id=12, syncedLyrics='')]).encode()]
        response = self.client.get(self.query.replace('/api/lyrics?', '/api/lyrics/search?'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual([r['id'] for r in response.json['candidates']], [10, 11])
        self.assertEqual(response.json['candidates'][1]['plainLyrics'], 'Live text')
        self.assertEqual(get.call_args.args[0], 'https://lrclib.net/api/search')
        self.assertEqual(get.call_args.kwargs['params'], dict(track_name='Song', artist_name='Artist'))
        get.return_value.close.assert_called_once()

    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_search_empty_invalid_and_bounded_responses(self, get):
        row = dict(id=10, trackName='Song', artistName='Artist', duration=123, plainLyrics='Text')
        for payload, expected in [([], 200), ({}, 502), ([row] * 101, 502),
                ([dict(row, id=True)], 200), ([dict(row, duration=float('nan'))], 200),
                ([dict(row, duration=10**500)], 200),
                ([dict(row, albumName=42)], 200), ([dict(row, plainLyrics='x' * 250001)], 200)]:
            get.return_value = Mock(status_code=200)
            get.return_value.iter_bytes.return_value = [json.dumps(payload).encode()]
            response = self.client.get('/api/lyrics/search?track_name=Song&artist_name=Artist')
            self.assertEqual(response.status_code, expected)
            if expected == 200:
                self.assertEqual(response.json['candidates'], [])
            get.return_value.close.assert_called_once()

    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_search_validation_and_provider_errors(self, get):
        self.assertEqual(self.client.get('/api/lyrics/search?track_name=Song').status_code, 400)
        get.assert_not_called()
        for code, expected in [(429, 429), (302, 502), (404, 404)]:
            get.return_value = Mock(status_code=code)
            self.assertEqual(self.client.get('/api/lyrics/search?track_name=Song&artist_name=Artist').status_code, expected)
        get.side_effect = httpx.ReadTimeout("slow")
        self.assertEqual(self.client.get('/api/lyrics/search?track_name=Song&artist_name=Artist').status_code, 504)

    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_search_stops_stream_at_response_limit(self, get):
        get.return_value = Mock(status_code=200)
        get.return_value.iter_bytes.return_value = [b' ' * 1_048_576, b'x']
        self.assertEqual(self.client.get('/api/lyrics/search?track_name=Song&artist_name=Artist').status_code, 502)
        get.return_value.close.assert_called_once()


    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_search_normalizes_missing_album_instead_of_displaying_null(self, get):
        row = dict(id=10, trackName='Song', artistName='Artist', duration=123, plainLyrics='Text')
        for album in [None, 'null', ' Null ', 'none', '']:
            get.return_value = Mock(status_code=200)
            get.return_value.iter_bytes.return_value = [json.dumps([dict(row, albumName=album)]).encode()]
            response = self.client.get('/api/lyrics/search?track_name=Song&artist_name=Artist')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['candidates'][0]['albumName'], '')


    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_search_isolates_invalid_rows_and_preserves_unknown_duration(self, get):
        row = dict(id=10, trackName='Song', artistName='Artist', duration=123, plainLyrics='Words')
        payload = [None, dict(row, artistName=None), dict(row, trackName=None),
                   dict(row, id=True), dict(row, duration=True), dict(row, duration='123'),
                   dict(row, duration=-1), dict(row, plainLyrics=42),
                   row, dict(row, id=11, duration=None),
                   {k: v for k, v in dict(row, id=12).items() if k != 'duration'}, row]
        response = get.return_value = Mock(status_code=200)
        response.iter_bytes.return_value = [json.dumps(payload).encode()]
        result = self.client.get('/api/lyrics/search?track_name=Song&artist_name=Artist')
        self.assertEqual(result.status_code, 200)
        self.assertEqual([r['id'] for r in result.json['candidates']], [10, 11, 12])
        self.assertEqual([r['duration'] for r in result.json['candidates']], [123, None, None])
        self.assertTrue(all(r['plainLyrics'] == 'Words' for r in result.json['candidates']))
        response.close.assert_called_once()


    @patch('api.lyrics_api.time.time', return_value=1_700_000_000)
    @patch('api.lyrics_api.fetch_lyrics_response')
    def test_rate_limit_preserves_status_and_normalizes_retry_after(self, get, clock):
        from email.utils import formatdate
        future = formatdate(1_700_000_120, usegmt=True)
        past = formatdate(1_699_999_999, usegmt=True)
        for path in ['/api/lyrics', '/api/lyrics/search']:
            for header, expected in [('120', 120), ('0', 0), (future, 120), (past, 0),
                                     (None, 60), ('invalid', 60), ('-5', 60), ('1.5', 60),
                                     ('9' * 101, 60), ('2147483648', 60)]:
                with self.subTest(path=path, header=header):
                    upstream = get.return_value = Mock(status_code=429, headers={'Retry-After': header})
                    response = self.client.get(path + '?track_name=Song&artist_name=Artist')
                    self.assertEqual(response.status_code, 429)
                    self.assertEqual(response.json['code'], 'LRCLIB_RATE_LIMITED')
                    self.assertEqual(response.json['retry_after_seconds'], expected)
                    self.assertEqual(response.headers['Retry-After'], str(expected))
                    self.assertIn(str(expected), response.json['error'])
                    upstream.iter_bytes.assert_not_called()
                    upstream.close.assert_called_once()

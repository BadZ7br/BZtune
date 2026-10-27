"""Run both download workers through real audio validation without external IO."""
import io
from pathlib import Path
from types import SimpleNamespace
import threading
import unittest
from unittest.mock import Mock, patch

from audio_fixtures import audio_fixture
import test_user_flows_smoke_audit as smoke
from api import downloads_api as direct, library_api as library
from services import ytdlp_worker as ytdlp


class DownloadAudioValidationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = smoke.UserFlowsSmokeTests('test_playlist_crud_persists_across_requests')
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        for module in (direct, ytdlp):
            self.enterContext(patch.multiple(
                module, FILES=library.FILES, connection=library.connection,
                extract_cover=Mock(return_value=None), lookup_cover=Mock(return_value=None),
            ))

    def tracks(self):
        return self.fixture.client.get('/api/library/tracks').json['tracks']

    def direct_download(self, content, extension):
        response = io.BytesIO(content)
        response.headers = {'Content-Type': 'application/octet-stream', 'Content-Length': str(len(content))}
        opener = Mock()
        opener.open.return_value = response
        with patch.object(direct.urllib.request, 'build_opener', return_value=opener), \
                patch.dict(direct.JOBS, {'fixture': {'status': 'pending'}}, clear=True):
            direct.run_download('fixture', 'https://archive.org/demo.' + extension,
                                'demo.' + extension, '.' + extension, 'Faixa', 'Artista')
            return dict(direct.JOBS['fixture'])

    def ytdlp_download(self, content):
        class FakeYoutubeDL:
            def __init__(self, options):
                self.folder = Path(options['outtmpl']).parent
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def extract_info(self, url, download):
                (self.folder / 'converted.mp3').write_bytes(content)
                return {'id': 'fixture'}

        def immediate_thread(*, target, daemon):
            return SimpleNamespace(start=target)

        jobs = {}
        with patch('yt_dlp.YoutubeDL', FakeYoutubeDL), \
                patch.object(ytdlp.threading, 'Thread', side_effect=immediate_thread), \
                patch.object(ytdlp.shutil, 'which', return_value='/fixture/ffmpeg'):
            initial = ytdlp.enqueue_ytdlp('https://archive.org/download/demo', 'Faixa', 'Artista', jobs, threading.Lock())
        return jobs[initial['id']]

    def test_direct_workers_accept_complete_valid_mp3_and_flac(self):
        for index, extension in enumerate(('mp3', 'flac'), start=1):
            with self.subTest(extension=extension):
                result = self.direct_download(audio_fixture(extension), extension)
                self.assertEqual(result['status'], 'complete', result)
                self.assertEqual(len(self.tracks()), index)
                self.assertEqual(result['downloaded'], len(audio_fixture(extension)))

    def test_direct_worker_rejects_header_only_and_cleans_temporary_file(self):
        result = self.direct_download(b'ID3' + b'\0' * 1024, 'mp3')
        self.assertEqual(result['status'], 'error', result)
        self.assertEqual(self.tracks(), [])
        self.assertEqual(list(library.FILES.iterdir()), [])

    def test_ytdlp_worker_accepts_valid_converted_audio(self):
        result = self.ytdlp_download(audio_fixture('mp3'))
        self.assertEqual(result['status'], 'complete', result)
        self.assertEqual(len(self.tracks()), 1)
        self.assertEqual(result['downloaded'], len(audio_fixture('mp3')))

    def test_ytdlp_worker_rejects_invalid_converted_audio(self):
        result = self.ytdlp_download(b'ID3' + b'\0' * 1024)
        self.assertEqual(result['status'], 'error', result)
        self.assertEqual(self.tracks(), [])
        self.assertEqual(list(library.FILES.iterdir()), [])

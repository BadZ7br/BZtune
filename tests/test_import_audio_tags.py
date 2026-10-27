import io,sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent))
import test_user_flows_smoke_audit as smoke
from audio_fixtures import audio_fixture
from api import library_api as library

class ImportTagsTests(unittest.TestCase):
    def setUp(self):
        self.fixture=smoke.UserFlowsSmokeTests('test_playlist_crud_persists_across_requests');self.fixture.setUp();self.addCleanup(self.fixture.tearDown)
    def upload(self,ext,**fields):
        with patch.object(library,'extract_cover',return_value=None):
            return self.fixture.client.post('/api/library/import',data={'file':(io.BytesIO(audio_fixture(ext)),'unrelated-name.'+ext),**fields},content_type='multipart/form-data')
    def test_real_mp3_and_flac_use_embedded_titles_and_artists(self):
        for ext,title,artist in [('mp3','Título embutido','Artista embutido'),('flac','Título FLAC','Artista FLAC')]:
            with self.subTest(format=ext):
                r=self.upload(ext);self.assertEqual(r.status_code,201);self.assertEqual(r.json['track']['title'],title);self.assertEqual(r.json['track']['artist'],artist)
    def test_explicit_user_metadata_remains_authoritative(self):
        r=self.upload('mp3',title='Meu título',artist='Meu artista');self.assertEqual(r.json['track']['title'],'Meu título');self.assertEqual(r.json['track']['artist'],'Meu artista')

    def test_header_only_files_are_rejected_without_records(self):
        for ext,data in [('mp3',b'ID3'+b'\0'*1024),('flac',b'fLaC'+b'\0'*1024)]:
            r=self.fixture.client.post('/api/library/import',data={'file':(io.BytesIO(data),'corrupt.'+ext)},content_type='multipart/form-data')
            self.assertEqual(r.status_code,415)
        self.assertEqual(self.fixture.client.get('/api/library/tracks').json['tracks'],[])

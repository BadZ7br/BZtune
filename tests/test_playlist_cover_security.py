"""Database artwork paths cannot escape their folder, including after restore."""
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import test_user_flows_smoke_audit as smoke
from api import playlists_api as playlists, library_api as library
from services import bztune_backup as backup

class CoverSecurityTests(unittest.TestCase):
    def setUp(self):
        self.fixture = smoke.UserFlowsSmokeTests('test_playlist_crud_persists_across_requests')
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.client = self.fixture.client
        self.pid = self.fixture.create_playlist()
        playlists.PLAYLIST_COVERS.mkdir()
        self.sentinel = library.BASE / 'sentinel.jpg'
        self.sentinel.write_bytes(b'outside cover directory')
        self.set_cover('../sentinel.jpg')

    def set_cover(self, name):
        with library.connection() as db:
            db.execute('UPDATE playlists SET cover_name=? WHERE id=?', (name, self.pid))
            db.commit()

    def test_invalid_reference_cannot_read_remove_or_delete_outside_file(self):
        self.assertEqual(self.client.get(f'/api/playlists/{self.pid}/cover').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/playlists/{self.pid}/cover').status_code, 200)
        self.set_cover('../sentinel.jpg')
        self.assertEqual(self.client.delete(f'/api/playlists/{self.pid}').status_code, 200)
        self.assertEqual(self.sentinel.read_bytes(), b'outside cover directory')

    def test_replacing_invalid_reference_preserves_outside_file_and_serves_new_cover(self):
        png = b'\x89PNG\r\n\x1a\nfixture'
        response = self.client.post(f'/api/playlists/{self.pid}/cover',
            data={'file': (io.BytesIO(png), 'cover.png')}, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 200)
        image = self.client.get(f'/api/playlists/{self.pid}/cover')
        self.assertEqual(image.data, png)
        image.close()
        self.assertTrue(self.sentinel.exists())

    def test_cover_symlink_does_not_expose_target(self):
        link = playlists.PLAYLIST_COVERS / 'alias.png'
        try:
            link.symlink_to(self.sentinel)
        except OSError:
            self.skipTest('Symlinks unavailable for this account')
        self.set_cover('alias.png')
        self.assertEqual(self.client.get(f'/api/playlists/{self.pid}/cover').status_code, 404)
        self.client.delete(f'/api/playlists/{self.pid}/cover')
        self.assertTrue(self.sentinel.exists())

    def test_backup_rejects_unsafe_database_reference(self):
        with patch.object(backup, 'BASE', library.BASE), patch.object(backup, 'DB', library.DB):
            with self.assertRaisesRegex(ValueError, 'Referência de capa'):
                backup.create_backup()

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('self_diagnostics', Path(__file__).resolve().parents[1] / 'doomvault-api/services/self_diagnostics.py')
diag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)


class DiagnosticTests(unittest.TestCase):
    def test_network_closes_stream_and_never_reads_body(self):
        response = MagicMock()
        response.status_code = 200
        with patch.object(diag.requests, 'get') as get:
            get.return_value.__enter__.return_value = response
            result = diag.network_check('LRCLIB')
            self.assertEqual(result['status'], 'ok')
            self.assertTrue(get.call_args.kwargs['stream'])
            self.assertFalse(get.call_args.kwargs['allow_redirects'])
            get.return_value.__exit__.assert_called_once()
            self.assertEqual(response.method_calls, [])

    def test_network_failure_does_not_publish_exception(self):
        with patch.object(diag.requests, 'get', side_effect=diag.requests.Timeout('SECRET /home/private')):
            result = diag.network_check('LRCLIB')
        self.assertEqual(result['status'], 'failed')
        self.assertNotIn('SECRET', str(result))

    def test_redirect_is_not_success(self):
        response = MagicMock(status_code=302)
        with patch.object(diag.requests, 'get') as get:
            get.return_value.__enter__.return_value = response
            self.assertEqual(diag.network_check('Catálogo YouTube Music')['status'], 'warning')

    def test_unknown_network_target_rejected(self):
        with self.assertRaises(KeyError):
            diag.network_check('https://localhost/private')

    def test_missing_database_is_not_created(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / 'missing.sqlite3'
            self.assertEqual(diag.files_check(db, directory)[0]['status'], 'failed')
            self.assertFalse(db.exists())

    def test_files_are_sampled_and_never_modified(self):
        import sqlite3
        from contextlib import closing
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dbpath = root / 'library.sqlite3'
            (root / 'good.mp3').write_bytes(b'hello')
            (root / 'wrong.mp3').write_bytes(b'hi')
            with closing(sqlite3.connect(dbpath)) as db:
                db.execute('CREATE TABLE tracks(id, stored_name, bytes)')
                db.executemany('INSERT INTO tracks VALUES(?,?,?)', [('1','good.mp3',5),('2','missing',5),('3','../private',3),('4','wrong.mp3',99)])
                db.commit()
            before = dbpath.read_bytes()
            result = diag.files_check(dbpath, root)[0]
            self.assertEqual(result['status'], 'warning')
            self.assertIn('1 ausentes', result['detail'])
            self.assertIn('2 referências', result['detail'])
            self.assertNotIn('private', str(result))
            self.assertEqual(dbpath.read_bytes(), before)
            self.assertIn('não examinados', diag.files_check(dbpath, root, limit=1)[0]['detail'])

    def test_tools_timeout_isolated_and_temporary_file_removed(self):
        import tempfile
        import subprocess
        with tempfile.TemporaryDirectory() as directory:
            with patch('shutil.which', return_value='ffmpeg'), patch('subprocess.run', side_effect=subprocess.TimeoutExpired('ffmpeg',3)):
                results = diag.tools_check(directory)
            self.assertEqual([r['status'] for r in results[:3]], ['failed','failed','ok'])
            self.assertEqual(list(Path(directory).iterdir()), [])

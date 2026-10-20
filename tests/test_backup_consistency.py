"""Synthetic libraries only: incomplete exports, rollback and installed data paths."""
import hashlib
import importlib
from contextlib import closing
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'doomvault-api'))
from services import bztune_backup as backup
from services import bztune_restore as restore

class BackupConsistencyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base = self.root / 'installed' / 'library'
        (self.base / 'audio').mkdir(parents=True)
        self.audio = self.base / 'audio' / 'demo.mp3'
        self.audio.write_bytes(b'ID3-synthetic-audio')
        self.db = self.base / 'library.sqlite3'
        with closing(sqlite3.connect(self.db)) as db:
            db.execute('CREATE TABLE tracks (id TEXT, stored_name TEXT, sha256 TEXT)')
            db.execute('INSERT INTO tracks VALUES (?, ?, ?)', ('demo', 'demo.mp3', hashlib.sha256(self.audio.read_bytes()).hexdigest()))
            db.commit()
        self.addCleanup(patch.stopall)
        patch.object(backup, 'BASE', self.base).start()
        patch.object(backup, 'DB', self.db).start()

    def archive(self):
        archive, folder = backup.create_backup()
        self.addCleanup(shutil.rmtree, folder, True)
        return archive

    def test_missing_referenced_audio_is_never_exported_as_valid(self):
        original = backup._data_files
        def disappear():
            self.audio.unlink()
            return original()
        with patch.object(backup, '_data_files', disappear):
            with self.assertRaisesRegex(ValueError, 'sem áudio'):
                backup.create_backup()

    def test_database_writer_waits_until_snapshot_and_files_are_complete(self):
        started, finished = threading.Event(), threading.Event()
        original = backup._data_files
        failures = []
        def writer():
            try:
                with closing(sqlite3.connect(self.db, timeout=10)) as db:
                    started.set()
                    db.execute("BEGIN IMMEDIATE")
                    db.execute("DELETE FROM tracks")
                    db.commit()
                self.audio.unlink()
            except Exception as error:
                failures.append(error)
            finally:
                finished.set()
        thread = threading.Thread(target=writer)
        def enumerate_files():
            thread.start()
            self.assertTrue(started.wait(1))
            self.assertFalse(finished.wait(.05))
            return original()
        with patch.object(backup, '_data_files', enumerate_files):
            archive = self.archive()
        thread.join(2)
        self.assertTrue(finished.is_set())
        self.assertEqual(failures, [])
        self.assertTrue(backup.inspect_backup(archive)['containsAudio'])

    def test_changed_audio_hash_is_rejected(self):
        self.audio.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'diverge'):
            backup.create_backup()

    def test_installed_directory_restores_without_source_checkout(self):
        archive = self.archive()
        self.audio.write_bytes(b'old-current-state')
        result = restore.restore(archive, self.root, True, library_dir=self.base)
        self.assertTrue(result['restored'])
        self.assertEqual(self.audio.read_bytes(), b'ID3-synthetic-audio')
        self.assertEqual((Path(result['backupAnterior']) / 'audio/demo.mp3').read_bytes(), b'old-current-state')

    def test_failed_directory_swap_restores_original_library(self):
        archive = self.archive()
        self.audio.write_bytes(b'preserve-me')
        replace = restore.os.replace
        def fail(source, destination):
            if Path(source).name.startswith('bztune_restore_') and Path(destination) == self.base:
                raise OSError('synthetic swap failure')
            return replace(source, destination)
        with patch.object(restore.os, 'replace', side_effect=fail):
            with self.assertRaisesRegex(OSError, 'swap failure'):
                restore.restore(archive, self.root, True, library_dir=self.base)
        self.assertEqual(self.audio.read_bytes(), b'preserve-me')

    def test_main_api_rejects_foreign_origins_before_mutation(self):
        with patch('ytmusicapi.YTMusic'):
            app = importlib.import_module('app').app
        client = app.test_client()
        response = client.post('/api/playlists', json={'name': 'must not be created'}, headers={'Origin': 'https://external.invalid'})
        self.assertEqual(response.status_code, 403)
        self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))
        response = client.options('/api/library/tracks', headers={'Origin': 'http://127.0.0.1:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Private-Network': 'true'})
        self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:5173')
        self.assertEqual(response.headers.get('Access-Control-Allow-Private-Network'), 'true')

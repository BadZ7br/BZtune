"""Testes do editor de metadados sem tocar na biblioteca real do usuário.

Execute a partir da raiz: python -m unittest discover -s tests -v
Requer as dependências Python já instaladas para rodar o backend.
"""
from __future__ import annotations

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

from flask import Flask

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "doomvault-api"))
from api import library_api as library  # noqa: E402


class MetadataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="bztune-meta-tests-")
        self.previous = (library.BASE, library.FILES, library.COVERS, library.DB)
        # sqlite3.Connection.__exit__ encerra a transação, mas NÃO fecha o arquivo.
        # No Windows, conexões abertas impedem remover o SQLite temporário.
        self._original_connection = library.connection
        self._test_connections = []
        library.connection = self._tracked_connection
        library.BASE = Path(self.temp.name)
        library.FILES = library.BASE / "audio"
        library.COVERS = library.BASE / "covers"
        library.DB = library.BASE / "library.sqlite3"
        self.app = Flask(__name__)
        self.app.register_blueprint(library.library_bp)
        self.client = self.app.test_client()
        with library.connection() as db:
            db.execute("""INSERT INTO tracks(id,title,artist,original_name,stored_name,mime,bytes,sha256)
                VALUES (?,?,?,?,?,?,?,?)""", ("t1","The Wizard","Black Sabbath", "wizard.mp3", "t1.mp3",
                        "audio/mpeg",5,"a"*64))
            self.album_id = library._get_or_create_album(db,"Black Sabbath", "Black Sabbath (2009 Remaster)")
            self.assertTrue(library._assign_album(db,"t1",self.album_id))
            db.execute("""CREATE TABLE playlist_entries(
                id TEXT PRIMARY KEY, source TEXT, track_id TEXT,title TEXT,artist TEXT,album TEXT)""")
            db.execute("INSERT INTO playlist_entries VALUES (?,?,?,?,?,?)",
                       ("l1","local","t1","The Wizard","Black Sabbath",""))
            db.execute("INSERT INTO playlist_entries VALUES (?,?,?,?,?,?)",
                       ("w1","web",None,"Online track","Black Sabbath",""))
            db.commit()
        (library.FILES / "t1.mp3").write_bytes(b"fake audio content unchanged")
        self.audio_hash = hashlib.sha256((library.FILES / "t1.mp3").read_bytes()).hexdigest()

    def _tracked_connection(self):
        db = self._original_connection()
        self._test_connections.append(db)
        return db

    def tearDown(self):
        # Reverte a substituição primeiro: outros testes continuam usando a API original.
        library.connection = self._original_connection
        try:
            for db in reversed(self._test_connections):
                db.close()
        finally:
            library.BASE, library.FILES, library.COVERS, library.DB = self.previous
            self.temp.cleanup()

    def test_track_edit_undo_and_playlist(self):
        response = self.client.patch("/api/library/tracks/t1/metadata",json={
            "title":"The Wizard (Remastered)","artist":"Black Sabbath",
            "album":"Black Sabbath (2009 Remaster)","year":2009,"trackNumber":2})
        self.assertEqual(response.status_code,200,response.get_json())
        self.assertEqual(response.get_json()["track"]["trackNumber"],2)
        tracks=self.client.get("/api/library/tracks").get_json()["tracks"]
        self.assertEqual(tracks[0]["year"],2009)
        with library.connection() as db:
            self.assertEqual(db.execute("SELECT title FROM playlist_entries WHERE id='l1'").fetchone()[0],"The Wizard (Remastered)")
            self.assertEqual(db.execute("SELECT title FROM playlist_entries WHERE id='w1'").fetchone()[0],"Online track")
        restored=self.client.post("/api/library/tracks/t1/metadata/undo")
        self.assertEqual(restored.status_code,200)
        self.assertEqual(restored.get_json()["track"]["title"],"The Wizard")
        self.assertIsNone(restored.get_json()["track"]["year"])
        self.assertEqual(hashlib.sha256((library.FILES / "t1.mp3").read_bytes()).hexdigest(),self.audio_hash)

    def test_validation_is_atomic(self):
        response=self.client.patch("/api/library/tracks/t1/metadata",json={"title":"Other title","year":"x"})
        self.assertEqual(response.status_code,400)
        with library.connection() as db:
            self.assertEqual(db.execute("SELECT title FROM tracks WHERE id='t1'").fetchone()[0],"The Wizard")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM track_metadata_history").fetchone()[0],0)

    def test_album_title_keeps_cover_and_id(self):
        cover=library.COVERS / ("album-"+self.album_id+".jpg")
        cover.write_bytes(b"fake cover bytes")
        response=self.client.patch(f"/api/library/albums/{self.album_id}/metadata",json={"title":"Black Sabbath (Reissue)"})
        self.assertEqual(response.status_code,200,response.get_json())
        self.assertEqual(response.get_json()["id"],self.album_id)
        self.assertEqual(cover.read_bytes(),b"fake cover bytes")
        response=self.client.post(f"/api/library/albums/{self.album_id}/metadata/undo")
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.get_json()["title"],"Black Sabbath (2009 Remaster)")

    def test_manual_removal_is_preserved(self):
        r=self.client.patch("/api/library/tracks/t1/metadata",json={"album":""})
        self.assertEqual(r.status_code,200)
        with library.connection() as db:
            self.assertEqual(db.execute("SELECT album_manual FROM track_metadata WHERE track_id='t1'").fetchone()[0],1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM local_album_tracks WHERE track_id='t1'").fetchone()[0],0)

if __name__=="__main__":
    unittest.main()

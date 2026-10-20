"""Testes funcionais offline de biblioteca e playlists no Flask real.

Todos os dados sao sinteticos em TemporaryDirectory. Nenhum arquivo do usuario,
download externo, instalador ou chamada para um provedor musical e executado.
"""
from __future__ import annotations

import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from flask import Flask

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "doomvault-api"))
from api import library_api as library
from api import playlists_api as playlists


class UserFlowsSmokeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="bztune-audit-")
        root = Path(self.tmp.name)
        self.previous = (
            library.BASE, library.FILES, library.COVERS, library.DB,
            library.connection, playlists.connection, playlists.PLAYLIST_COVERS
        )
        self.original_connection = library.connection
        self.open_connections = []
        library.BASE = root
        library.FILES = root / "audio"
        library.COVERS = root / "covers"
        library.DB = root / "library.sqlite3"
        playlists.PLAYLIST_COVERS = root / "playlist_covers"
        library.connection = self.tracked_connection
        playlists.connection = self.tracked_connection

        app = Flask(__name__)
        app.register_blueprint(library.library_bp)
        app.register_blueprint(playlists.playlists_bp)
        self.client = app.test_client()
        self.sample_mp3 = b"ID3" + b"\x00" * 1024

    def tracked_connection(self):
        db = self.original_connection()
        self.open_connections.append(db)
        return db

    def tearDown(self):
        (
            library.BASE, library.FILES, library.COVERS, library.DB,
            library.connection, playlists.connection, playlists.PLAYLIST_COVERS
        ) = self.previous
        for db in reversed(self.open_connections):
            db.close()
        self.tmp.cleanup()

    def create_playlist(self, name="Minhas musicas"):
        response = self.client.post("/api/playlists", json={"name": name})
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()["playlist"]["id"]

    def import_audio(self):
        with patch.object(library, "extract_cover", return_value=None):
            return self.client.post(
                "/api/library/import",
                data={"file": (io.BytesIO(self.sample_mp3), "demo.mp3"),
                      "title": "Exemplo", "artist": "Artista"},
                content_type="multipart/form-data"
            )

    def test_playlist_crud_persists_across_requests(self):
        self.assertEqual(self.client.post("/api/playlists", json={"name": ""}).status_code, 400)
        pid = self.create_playlist("Rock")
        patched = self.client.patch(f"/api/playlists/{pid}", json={
            "name": "Doom", "description": "Album favorito"
        })
        self.assertEqual(patched.status_code, 200)
        found = self.client.get("/api/playlists").get_json()["playlists"]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["name"], "Doom")
        self.assertEqual(found[0]["description"], "Album favorito")
        deleted = self.client.delete(f"/api/playlists/{pid}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.client.get("/api/playlists").get_json()["playlists"], [])

    def test_web_track_added_reloaded_and_duplicate_blocked(self):
        pid = self.create_playlist()
        data = {"video_id": "abcdefghijk", "title": "Solitude", "artist": "Black Sabbath"}
        added = self.client.post(f"/api/playlists/{pid}/tracks", json=data)
        self.assertEqual(added.status_code, 201, added.get_json())
        self.assertEqual(added.get_json()["playlist"]["count"], 1)
        self.assertEqual(self.client.post(f"/api/playlists/{pid}/tracks", json=data).status_code, 409)
        entries = self.client.get("/api/playlists").get_json()["playlists"][0]["tracks"]
        self.assertEqual(entries[0]["source"], "web")
        self.assertEqual(entries[0]["title"], "Solitude")

    def test_invalid_web_id_rejected_and_bulk_reports_all_outcomes(self):
        pid = self.create_playlist()
        wrong = {"video_id": "bad", "title": "M", "artist": "A"}
        self.assertEqual(self.client.post(f"/api/playlists/{pid}/tracks", json=wrong).status_code, 400)
        valid = {"video_id": "abcdefghijk", "title": "Track", "artist": "Artist"}
        r = self.client.post(f"/api/playlists/{pid}/tracks/bulk",
                             json={"tracks": [valid, valid, wrong, "invalid"]})
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual((r.get_json()["added"], r.get_json()["duplicates"],
                          r.get_json()["invalid"]), (1, 1, 2))
        self.assertEqual(r.get_json()["playlist"]["count"], 1)

    def test_playlist_order_and_remove_entry(self):
        pid = self.create_playlist()
        for n, name in enumerate(["abcdefghijk", "lmnopqrstuv"]):
            self.assertEqual(self.client.post(f"/api/playlists/{pid}/tracks", json={
                "video_id": name, "title": f"Music {n}", "artist": "Test Artist"
            }).status_code, 201)
        tracks = self.client.get("/api/playlists").get_json()["playlists"][0]["tracks"]
        ids = [item["id"] for item in tracks]
        self.assertEqual(self.client.put(f"/api/playlists/{pid}/order",
                                         json={"entry_ids": ids[::-1]}).status_code, 200)
        result = self.client.get("/api/playlists").get_json()["playlists"][0]
        self.assertEqual([t["id"] for t in result["tracks"]], ids[::-1])
        self.assertEqual(self.client.delete(f"/api/playlists/{pid}/entries/{ids[0]}").status_code, 200)
        self.assertEqual(self.client.get("/api/playlists").get_json()["playlists"][0]["count"], 1)

    def test_mp3_import_stream_range_duplicate_and_delete(self):
        imported = self.import_audio()
        self.assertEqual(imported.status_code, 201, imported.get_json())
        tid = imported.get_json()["track"]["id"]
        self.assertEqual(self.client.get("/api/library/tracks").get_json()["tracks"][0]["id"], tid)
        response = self.client.get(f"/api/library/tracks/{tid}/audio",
                                   headers={"Range": "bytes=0-4"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.data, self.sample_mp3[:5])
        # Flask test_client conserva o handle de send_file no Windows ate close().
        response.close()
        self.assertTrue(self.import_audio().get_json()["duplicate"])
        self.assertEqual(self.client.delete(f"/api/library/tracks/{tid}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/library/tracks/{tid}/audio").status_code, 404)

    @unittest.skipUnless(sys.platform == "win32", "Verifica o bloqueio real de arquivo pelo Windows; a simulação é multiplataforma")
    def test_delete_while_audio_is_locked_preserves_database(self):
        """Defeito reproduzivel: Windows bloqueia unlink; DB nao deve ser apagado antes."""
        imported = self.import_audio()
        tid = imported.get_json()["track"]["id"]
        file_path = library.FILES / (tid + ".mp3")
        # Simula navegador/reprodutor mantendo leitura aberta durante exclusao.
        with file_path.open("rb") as held:
            response = self.client.delete(f"/api/library/tracks/{tid}")
            # Comportamento desejado: recusar com 409 SEM perder o registro.
            self.assertEqual(response.status_code, 409)
            self.assertEqual(self.client.get("/api/library/tracks").get_json()["tracks"][0]["id"], tid)
            self.assertTrue(file_path.exists())
            self.assertTrue(held.read(3).startswith(b"ID3"))

    def test_simulated_windows_lock_never_deletes_track_or_playlist(self):
        """WinError 32 reproduzido deterministicamente em qualquer plataforma."""
        imported = self.import_audio()
        tid = imported.get_json()["track"]["id"]
        pid = self.create_playlist()
        self.assertEqual(self.client.post(
            f"/api/playlists/{pid}/tracks", json={"track_id": tid}
        ).status_code, 201)
        file_path = library.FILES / (tid + ".mp3")
        original_replace = Path.replace

        def locked_replace(source, target):
            if source == file_path:
                raise PermissionError(13, "Arquivo em uso", str(source))
            return original_replace(source, target)

        with patch.object(Path, "replace", autospec=True, side_effect=locked_replace):
            response = self.client.delete(f"/api/library/tracks/{tid}")
        self.assertEqual(response.status_code, 409, response.data)
        self.assertIn("uso", response.get_json()["error"])
        self.assertTrue(file_path.exists())
        self.assertEqual(len(self.client.get("/api/library/tracks").get_json()["tracks"]), 1)
        self.assertEqual(self.client.get("/api/playlists").get_json()["playlists"][0]["count"], 1)
        # Ao liberar o bloqueio, a mesma operação deve ter sucesso.
        self.assertEqual(self.client.delete(f"/api/library/tracks/{tid}").status_code, 200)
        self.assertFalse(file_path.exists())

    def test_db_error_restores_audio_and_playlist(self):
        """Se a transação SQL falhar, desfaz a movimentação do arquivo."""
        import sqlite3
        imported = self.import_audio()
        tid = imported.get_json()["track"]["id"]
        pid = self.create_playlist()
        self.client.post(f"/api/playlists/{pid}/tracks", json={"track_id": tid})
        audio = library.FILES / (tid + ".mp3")

        class FailDelete:
            def __init__(self, real):
                self.real = real

            def __enter__(self):
                self.real.__enter__()
                return self

            def __exit__(self, *args):
                return self.real.__exit__(*args)

            def execute(self, query, *args):
                if query.startswith("DELETE FROM tracks"):
                    raise sqlite3.OperationalError("Teste: falha na exclusão SQL")
                return self.real.execute(query, *args)

            def __getattr__(self, name):
                return getattr(self.real, name)

        def failing_connection():
            return FailDelete(self.tracked_connection())

        with patch.object(library, "connection", side_effect=failing_connection):
            response = self.client.delete(f"/api/library/tracks/{tid}")
        self.assertEqual(response.status_code, 500)
        self.assertTrue(audio.exists())
        self.assertEqual(len(self.client.get("/api/library/tracks").get_json()["tracks"]), 1)
        self.assertEqual(self.client.get("/api/playlists").get_json()["playlists"][0]["count"], 1)
        self.assertEqual(list(library.FILES.glob("*.deleting")), [])

    def test_delete_missing_audio_cleans_database_without_500(self):
        imported = self.import_audio()
        tid = imported.get_json()["track"]["id"]
        (library.FILES / (tid + ".mp3")).unlink()
        self.assertEqual(self.client.delete(f"/api/library/tracks/{tid}").status_code, 200)
        self.assertEqual(self.client.get("/api/library/tracks").get_json()["tracks"], [])

    def test_local_playlist_entry_removed_when_audio_deleted(self):
        imp = self.import_audio()
        self.assertEqual(imp.status_code, 201)
        tid = imp.get_json()["track"]["id"]
        pid = self.create_playlist()
        r = self.client.post(f"/api/playlists/{pid}/tracks", json={"track_id": tid})
        self.assertEqual(r.status_code, 201, r.get_json())
        self.assertEqual(r.get_json()["playlist"]["tracks"][0]["source"], "local")
        self.assertEqual(self.client.delete(f"/api/library/tracks/{tid}").status_code, 200)
        remaining = self.client.get("/api/playlists").get_json()["playlists"][0]
        self.assertEqual(remaining["count"], 0)

    def test_import_rejects_invalid_files_without_creating_library_records(self):
        bad = self.client.post("/api/library/import",
                               data={"file": (io.BytesIO(b"not music"), "fake.mp3")},
                               content_type="multipart/form-data")
        self.assertEqual(bad.status_code, 415)
        self.assertEqual(self.client.get("/api/library/tracks").get_json()["tracks"], [])


if __name__ == "__main__":
    unittest.main()

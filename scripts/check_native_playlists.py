"""Cross-check Rust/Python against one temporary library; never touches user data.

Build desktop/native-core's playlist_service example first, then pass its executable.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def check(bridge: Path) -> None:
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root / "doomvault-api"))
    from flask import Flask
    from api import library_api as library

    with tempfile.TemporaryDirectory(prefix="bztune-native-compat-") as directory:
        library.BASE = Path(directory)
        library.DB = library.BASE / "library.sqlite3"
        library.FILES = library.BASE / "audio"
        library.COVERS = library.BASE / "covers"
        # Import only after configuring the isolated library, as the desktop does.
        from api import playlists_api as legacy

        app = Flask(__name__)
        app.register_blueprint(legacy.playlists_bp)
        client = app.test_client()

        def native(**request):
            completed = subprocess.run([str(bridge), directory], input=json.dumps(request)+"\n",
                                       capture_output=True, text=True, check=True, timeout=15)
            result = json.loads(completed.stdout)
            if not result["ok"]:
                raise AssertionError(result["error"])
            return result["value"]

        def compare():
            actual = native(action="list")
            expected = client.get("/api/playlists").get_json()
            assert actual == expected, (actual, expected)

        # Seed through the production Python schema/handlers, not the Rust schema.
        with legacy.db_open() as db:
            db.execute("""INSERT INTO tracks(id,title,artist,original_name,stored_name,mime,bytes,sha256)
                VALUES ('local-track','Faixa local','Artista','keep.mp3','keep.mp3','audio/mpeg',4,'hash')""")
        audio = library.FILES / "keep.mp3"
        audio.write_bytes(b"keep")
        playlist = client.post("/api/playlists", json={"name": "Coleção 🎵", "description": "Descrição"}).get_json()["playlist"]
        playlist_id = playlist["id"]
        assert client.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": "local-track"}).status_code == 201
        compare()

        native(action="update", id=playlist_id, name="Editada pelo Rust", description="Compatível")
        compare()
        track = {"video_id": "abcdefghijk", "title": "Faixa online", "artist": "Banda", "album": "Álbum"}
        mixed = native(action="add_tracks", id=playlist_id, tracks=[track, track, {"video_id": "invalid"}])
        assert (mixed["added"], mixed["duplicates"], mixed["invalid"]) == (1, 1, 1)
        assert client.post(f"/api/playlists/{playlist_id}/tracks", json=track).status_code == 409
        compare()
        ids = [entry["id"] for entry in mixed["playlist"]["tracks"]]
        native(action="reorder", id=playlist_id, entry_ids=ids[::-1])
        compare()
        assert client.delete(f"/api/playlists/{playlist_id}/entries/{ids[0]}").status_code == 200
        compare()
        created = native(action="create", name="Nova pelo Rust", description="")
        compare()
        native(action="delete", id=created["playlist"]["id"])
        native(action="delete", id=playlist_id)
        compare()
        assert audio.read_bytes() == b"keep"
        print("OK: Python ↔ Rust list/create/edit/add/bulk/duplicate/reorder/remove/delete; audio preserved.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bridge", type=Path)
    check(parser.parse_args().bridge.resolve())

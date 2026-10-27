"""Exercise the real Flask album route with an offline provider fixture."""
import subprocess
import sys
from pathlib import Path
import unittest


class AlbumTrackArtistsTests(unittest.TestCase):
    def test_album_route_preserves_track_performers_and_legacy_array(self):
        # Keep the full application import isolated from unit-test blueprint stubs.
        code = '''
from unittest.mock import Mock, patch
provider = Mock()
provider.get_album.return_value = {
    "title": "Coletânea", "artists": [{"name": "Vários artistas"}],
    "tracks": [
        {"title": "Faixa individual", "videoId": "abcdefghijk", "artists": [
            {"name": " Artista da faixa "}, {"name": "Convidado"},
            {"name": None}, {"name": " "}
        ]},
        {"title": "Sem crédito", "artists": None}
    ]
}
with patch("ytmusicapi.YTMusic", return_value=provider):
    import app
    response = app.app.test_client().get("/api/albums/compilation")
    assert response.status_code == 200, response.get_data(as_text=True)
    tracks = response.get_json()["tracks"]
    assert tracks[0]["artist"] == "Artista da faixa, Convidado", tracks
    assert tracks[0]["artists"] == ["Artista da faixa", "Convidado"], tracks
    assert tracks[1]["artists"] == [] and tracks[1]["artist"] == "", tracks
    provider.get_album.assert_called_once_with("compilation")
'''
        result = subprocess.run(
            [sys.executable, '-c', code],
            cwd=Path(__file__).resolve().parents[1] / 'doomvault-api',
            capture_output=True, text=True, encoding='utf-8', timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

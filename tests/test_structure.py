"""Testes de regressão estrutural, sem instalar React/Flask."""
from __future__ import annotations
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class StructureTests(unittest.TestCase):
    def test_imports_e_css(self):
        result = subprocess.run([sys.executable,str(ROOT / "scripts" / "verify_structure.py")],
                                capture_output=True,text=True,check=False)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_player_preservado(self):
        player = (ROOT / "doomvault" / "src" / "player" / "MusicPlayer.tsx").read_text(encoding="utf-8")
        for token in ["loadYouTubeApi", "crossfade", "AddToPlaylistButton", "CatalogDownloadButton", "toggleMute"]:
            self.assertIn(token,player)
        context = (ROOT / "doomvault" / "src" / "player" / "PlayerContext.tsx").read_text(encoding="utf-8")
        for token in ["toggleShuffle", "cycleRepeat", "reorderQueue", "removeFromQueue"]:
            self.assertIn(token,context)

    def test_paths_dados_invariantes(self):
        library = (ROOT / "doomvault-api" / "api" / "library_api.py").read_text(encoding="utf-8")
        downloads = (ROOT / "doomvault-api" / "api" / "downloads_api.py").read_text(encoding="utf-8")
        self.assertIn('parents[1] / "doomvault_library"', library)
        self.assertIn('parents[1] / "doomvault_download_sources.json"',downloads)

    def test_entrada_flask_preservada(self):
        app = (ROOT / "doomvault-api" / "app.py").read_text(encoding="utf-8")
        self.assertIn('app.register_blueprint(library_bp)',app)
        self.assertIn('app.register_blueprint(playlists_bp)',app)
        self.assertIn('app.run(',app)

if __name__ == "__main__": unittest.main()

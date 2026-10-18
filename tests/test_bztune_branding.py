"""Contratos da identidade BZtune sem apagar dados ou versões anteriores."""
from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "doomvault"
SRC = FRONTEND / "src"


class BZtuneBrandingTests(unittest.TestCase):
    def test_all_user_facing_branding_is_bztune(self):
        paths = [
            FRONTEND / "index.html",
            SRC / "App.tsx",
            SRC / "pages" / "HomePage.tsx",
            SRC / "pages" / "ArtistPage.tsx",
            SRC / "pages" / "AlbumPage.tsx",
            SRC / "playlists" / "PlaylistsPage.tsx",
            SRC / "features" / "DiscoveryPage.tsx",
            SRC / "features" / "ListeningStatsPage.tsx",
            SRC / "features" / "DataToolsPage.tsx",
        ]
        for path in paths:
            source = path.read_text(encoding="utf-8")
            with self.subTest(file=str(path.relative_to(ROOT))):
                self.assertNotIn("DOOMVAULT", source)
                self.assertNotIn("DoomVault — Music", source)
                self.assertNotIn("BZtune v1.5", source)
                self.assertNotIn("BZtune v1.6", source)
                self.assertNotIn("BZtune v1.7", source)
                self.assertIn("bztune", source.lower())

    def test_tauri_version_is_retrieved_instead_of_hardcoding_old_version(self):
        app = (SRC / "App.tsx").read_text(encoding="utf-8")
        label = (SRC / "BZtuneVersionLabel.tsx").read_text(encoding="utf-8")
        self.assertIn("<BZtuneVersionLabel />", app)
        self.assertNotIn("<span>v1.1</span>", app)
        self.assertIn('bridge.invoke("desktop_version")', label)
        self.assertIn('setLabel(`v${version}`)', label)
        self.assertIn('setLabel("Web")', label)

    def test_legacy_storage_and_events_stay_backward_compatible(self):
        app = (SRC / "App.tsx").read_text(encoding="utf-8")
        context = (SRC / "player" / "PlayerContext.tsx").read_text(encoding="utf-8")
        music = (SRC / "player" / "MusicPlayer.tsx").read_text(encoding="utf-8")
        tools = (SRC / "features" / "DataToolsPage.tsx").read_text(encoding="utf-8")
        for key in ("doomvault-api-albums", "doomvault-favorites", "doomvault-collection",
                    "doomvault-last-tab", "doomvault-playlists-updated"):
            self.assertIn(key, app)
        self.assertIn("doomvault-player-state-v11", context)
        self.assertIn("doomvault-resume-position-v11", music)
        self.assertIn('key.startsWith("doomvault-")', tools)

    def test_desktop_app_name_and_updater_not_changed(self):
        conf = json.loads((ROOT / "desktop" / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))
        self.assertEqual(conf["productName"], "BZtune")
        self.assertEqual(conf["app"]["windows"][0]["title"], "BZtune Desktop")
        self.assertEqual(
            conf["plugins"]["updater"]["endpoints"],
            ["https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json"],
        )

    def test_video_download_verification_error_is_not_shown_verbatim(self):
        source = (SRC / "library" / "CatalogDownloadButton.tsx").read_text(encoding="utf-8")
        self.assertIn("friendlyDownloadMessage", source)
        self.assertIn("sign in to confirm", source)
        self.assertIn("Esta fonte exige verificação do YouTube", source)
        self.assertIn("friendlyDownloadMessage(batch.errors[0])", source)
        self.assertIn("friendlyDownloadMessage(batch.warnings[0])", source)
        self.assertNotIn("cookies-from-browser"", source.split("return ")[-1])


if __name__ == "__main__":
    unittest.main()

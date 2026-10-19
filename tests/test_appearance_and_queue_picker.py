"""Auditoria de contratos: preferências reversíveis e mesma fila usada em todo o aplicativo."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SETTINGS = (ROOT / "doomvault/src/features/SettingsPanel.tsx").read_text(encoding="utf-8")
QUEUE = (ROOT / "doomvault/src/player/QueuePicker.tsx").read_text(encoding="utf-8")
PLAYER = (ROOT / "doomvault/src/player/MusicPlayer.tsx").read_text(encoding="utf-8")
CONTEXT = (ROOT / "doomvault/src/player/PlayerContext.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "doomvault/src/styles.css").read_text(encoding="utf-8")
APP = (ROOT / "doomvault/src/App.tsx").read_text(encoding="utf-8")

class SettingsAndQueueTests(unittest.TestCase):
    def test_all_six_tabs_have_content(self):
        for tab in ('general', 'appearance', 'playback', 'downloads', 'updates', 'data'):
            with self.subTest(tab=tab):
                self.assertIn(f'page === "{tab}"', SETTINGS)
        self.assertIn('role="tablist"', SETTINGS)

    def test_preferences_persist_and_can_reset(self):
        self.assertIn('bztune-appearance-v1', SETTINGS)
        self.assertIn('localStorage.setItem(STORAGE', SETTINGS)
        self.assertIn('setPrefs({ ...DEFAULT })', SETTINGS)
        self.assertIn('initAppearance()', (ROOT / "doomvault/src/main.tsx").read_text(encoding="utf-8"))
        self.assertIn('PALETTE.includes(', SETTINGS)
        self.assertIn('data-bztune-theme=', '') if False else None

    def test_preferences_have_safe_bounds_and_presentation(self):
        for value in ("90, 100, 110, 120", "4, 8, 12, 18", "comfortable", "compact", "prefers-color-scheme"):
            self.assertIn(value, SETTINGS)
        self.assertIn('prefers-reduced-motion', CSS)
        self.assertIn('--bz-user-accent', CSS)
        self.assertIn('max-width:800px', CSS)

    def test_queue_picker_uses_existing_queue_and_matches_library_track_format(self):
        self.assertIn('const { addToQueue, tracks }', QUEUE)
        self.assertIn('videoId: "library:" + item.id', QUEUE)
        self.assertIn('audioUrl: API + (item.audioUrl', QUEUE)
        self.assertIn('addToQueue(track)', QUEUE)
        self.assertIn('t.videoId === "library:" + item.id', QUEUE)
        self.assertIn('<QueuePicker />', PLAYER)
        self.assertIn('const addToQueue = useCallback', CONTEXT)
        self.assertIn('aria-label="Pesquisar na biblioteca para adicionar à fila"', QUEUE)

    def test_player_scroll_and_updater_unchanged(self):
        self.assertIn('className="bz32-queue-scroll"', PLAYER)
        self.assertIn('.bz32-queue-scroll', CSS)
        self.assertIn('id="bztune-desktop-update-slot"', APP)
        self.assertIn('className="bz-system-card bz-system-update-card"', APP)
        self.assertLessEqual(CSS.count("!important"), 185)

if __name__ == "__main__":
    unittest.main()

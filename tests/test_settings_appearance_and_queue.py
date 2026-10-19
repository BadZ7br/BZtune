"""Auditoria estática de aparência, filas, compatibilidade e CSS do BZtune."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "doomvault" / "src"
APP = (SRC / "App.tsx").read_text(encoding="utf-8")
PREF = (SRC / "settings" / "AppearanceContext.tsx").read_text(encoding="utf-8")
SETTINGS = (SRC / "settings" / "SettingsPage.tsx").read_text(encoding="utf-8")
CSS = (SRC / "styles.css").read_text(encoding="utf-8")
UPDATER = (ROOT / "doomvault" / "public" / "desktop-updates.js").read_text(encoding="utf-8")
PLAYER = (SRC / "player" / "MusicPlayer.tsx").read_text(encoding="utf-8")
QUEUE = (SRC / "player" / "PlayerContext.tsx").read_text(encoding="utf-8")

class SettingsIntegrationTests(unittest.TestCase):
    def test_six_categories_have_real_interface(self):
        for tab in ("general", "interface", "playback", "downloads", "updates", "data"):
            with self.subTest(tab=tab):
                self.assertIn('id: "' + tab + '"', SETTINGS)
        self.assertIn("onClick={() => setCategory(c.id)}", SETTINGS)
        self.assertIn("AppearanceProvider", APP)
        self.assertIn('import SettingsPage from "./settings/SettingsPage"', APP)
        self.assertIn("<SettingsPage", APP)
        self.assertNotIn('className="bz-system-pending">Próxima etapa', APP)

    def test_preferences_persist_and_do_not_clobber_existing_data(self):
        self.assertIn('bztune-settings-v1', PREF)
        self.assertIn('localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences))', PREF)
        self.assertIn('normalizePreferences(JSON.parse(', PREF)
        self.assertIn("root.style.setProperty(\"--lime\"", PREF)
        self.assertIn("root.dataset.bzTheme", PREF)
        self.assertIn("matchMedia", PREF)
        self.assertIn("query.addEventListener(\"change\", onChange)", PREF)
        self.assertIn("doomvault-last-tab", APP)
        self.assertIn('const desired = loadPreferences().startPage', APP)
        for old_key in ("doomvault-favorites", "doomvault-collection", "doomvault-api-albums"):
            self.assertIn(old_key, APP)
        self.assertNotIn("localStorage.clear()", PREF)

    def test_custom_color_guard_and_reset_only_visual_data(self):
        self.assertIn('/^#[0-9a-fA-F]{6}$/', PREF)
        for attr in ("theme", "accent", "density", "fontSize", "corners",
                     "transparency", "animations", "shadows", "sidebarGlow",
                     "focusRings", "autoUpdates", "startPage"):
            self.assertIn(attr + ":", PREF)
        self.assertIn("resetAppearance", PREF)
        self.assertIn("...current", PREF)
        self.assertIn('aria-label="Selecionar cor personalizada"', SETTINGS)
        self.assertIn("ACCENT_COLORS.map(", SETTINGS)

    def test_player_settings_are_connected_to_real_controls(self):
        self.assertIn("player.setVolume(Number(e.target.value))", SETTINGS)
        self.assertIn("player.toggleShuffle()", SETTINGS)
        self.assertIn("player.cycleRepeat", SETTINGS)
        self.assertIn('CustomEvent("bztune-crossfade-change"', SETTINGS)
        self.assertIn('addEventListener("bztune-crossfade-change"', PLAYER)
        self.assertIn('localStorage.setItem("bztune-crossfade-v13"', SETTINGS)

    def test_updates_respect_preference_but_manual_check_still_possible(self):
        self.assertIn('preferences?.autoUpdates === false', UPDATER)
        self.assertIn('void onCheck(true)', UPDATER)
        self.assertIn('onClick={() => setCategory(c.id)}', SETTINGS)
        self.assertIn('updater={<div id="bztune-desktop-update-slot"', APP)
        self.assertEqual(APP.count('id="bztune-desktop-update-slot"'), 1)
        self.assertIn('style={{ display: category === "updates" ? "block" : "none" }}', SETTINGS)
        self.assertIn('updateSystemBadge(true)', UPDATER)

    def test_accessibility_and_low_width_layout(self):
        self.assertIn('aria-checked={checked}', SETTINGS)
        self.assertIn('role="switch"', SETTINGS)
        self.assertIn('aria-pressed={pref.theme === theme}', SETTINGS)
        self.assertIn('aria-label="Categorias de configurações"', SETTINGS)
        self.assertIn('grid-template-columns: 1fr', CSS)
        self.assertIn('@media (max-width: 430px)', CSS)
        self.assertIn('overflow-x: auto', CSS)
        self.assertIn('prefers-reduced-motion', CSS)
        self.assertLessEqual(CSS.count("!important"), 185)
        # Nunca modificar estilos da janela fixa do player ao trocar de tema.
        self.assertIn('.dv-player.bz32-full', CSS)
        self.assertIn('overflow: hidden !important', CSS)

    def test_queue_actions_in_all_core_song_lists(self):
        paths = [
            SRC / "pages" / "HomePage.tsx",
            SRC / "pages" / "AlbumPage.tsx",
            SRC / "pages" / "UniversalSearch.tsx",
            SRC / "playlists" / "PlaylistsPage.tsx",
            SRC / "features" / "DiscoveryPage.tsx",
        ]
        for path in paths:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertIn("playNext(", text)
                self.assertIn("addToQueue(", text)
        self.assertIn("insertNextQueueItem", QUEUE)
        self.assertIn('if (before.index < 0) setPlaying(false)', QUEUE)
        self.assertIn("remapMovedIndex", QUEUE)
        self.assertIn("history.current", QUEUE)
        self.assertIn("shuffledPlayed.current", QUEUE)
        self.assertIn("priorityNext.current = null", QUEUE)
        self.assertIn("target = priority", QUEUE)
        self.assertIn("priorityNext.current = remapMovedIndex", QUEUE)
        self.assertIn("bz32-queue-scroll", PLAYER)

if __name__ == "__main__":
    unittest.main()

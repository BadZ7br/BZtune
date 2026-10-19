"""Contratos de navegação do BZtune: cinco áreas, todas as rotas e updater acessíveis."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "doomvault" / "src" / "App.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "doomvault" / "src" / "styles.css").read_text(encoding="utf-8")
UPDATER = (ROOT / "doomvault" / "public" / "desktop-updates.js").read_text(encoding="utf-8")


class SidebarV2Tests(unittest.TestCase):
    def test_exactly_five_primary_buttons(self):
        begin = APP.index('<nav className="nav-list nav-list-primary"')
        end = APP.index("</nav>", begin)
        nav = APP[begin:end]
        self.assertEqual(nav.count("<button"), 5)
        self.assertEqual(nav.count("nav-item-primary"), 5)
        for section in ("home", "explore", "library", "tools", "system"):
            with self.subTest(section=section):
                self.assertIn(f'navigate(AREA_HOME.{section})', nav)
                self.assertIn(f'activeArea === "{section}"', nav)
        for title in ("Início", "Explorar", "Biblioteca", "Ferramentas", "Sistema"):
            self.assertIn(f"<span>{title}</span>", nav)
        for old in ("Pesquisar", "Minha coleção", "Playlists", "Estatísticas",
                    "Backup e Diagnóstico", "Descoberta musical"):
            self.assertNotIn(f"<span>{old}</span>", nav)

    def test_context_tabs_keep_all_existing_features(self):
        for key in ('search', 'categories', 'discovery', 'recommendations',
                    'library', 'collection', 'favorites', 'playlists',
                    'stats', 'maintenance'):
            with self.subTest(route=key):
                self.assertRegex(APP, r'\{ tab: "' + key + r'", label: "[^"]+" \}')
        self.assertIn('onClick={() => navigate(option.tab)}', APP)
        self.assertIn('aria-current={tab === option.tab ? "page" : undefined}', APP)
        self.assertIn('onOpenBackup={() => navigate("maintenance")}', APP)

    def test_data_storage_and_legacy_routes_preserved(self):
        self.assertIn('localStorage.getItem("doomvault-last-tab")', APP)
        self.assertIn('localStorage.setItem("doomvault-last-tab", tab)', APP)
        self.assertIn('const CATALOG_KEY = "doomvault-api-albums"', APP)
        self.assertIn('const FAVORITES_KEY = "doomvault-favorites"', APP)
        self.assertIn('const COLLECTION_KEY = "doomvault-collection"', APP)
        self.assertIn('window.dispatchEvent(new Event("doomvault-playlists-updated"))', APP)

    def test_system_hub_and_update_slot_always_mounted(self):
        self.assertIn('tab === "system" ? "block" : "none"', APP)
        self.assertIn('id="bztune-desktop-update-slot"', APP)
        self.assertEqual(APP.count('id="bztune-desktop-update-slot"'), 1)
        self.assertIn("<SettingsPage", APP)
        self.assertIn('updater={<div id="bztune-desktop-update-slot"', APP)
        settings = (ROOT / "doomvault" / "src" / "settings" / "SettingsPage.tsx").read_text(encoding="utf-8")
        self.assertIn('className="bz-system-card bz-system-update-card"', settings)
        self.assertIn('document.getElementById("bztune-desktop-update-slot")', UPDATER)
        self.assertIn('document.querySelector?.("[data-bztune-system-nav]")', UPDATER)
        self.assertIn('updateSystemBadge(true)', UPDATER)
        self.assertIn('updateSystemBadge(false)', UPDATER)

    def test_sidebar_stays_fixed_and_mobile_menu_accessible(self):
        self.assertRegex(CSS, r'(?s)\.sidebar\s*\{[^}]+position: fixed')
        self.assertIn(".sidebar.sidebar-open", CSS)
        self.assertIn(".mobile-scrim", CSS)
        self.assertIn(".bz-area-tabs-items", CSS)
        self.assertIn("overflow-x: auto", CSS)
        self.assertIn(".dv-app .nav-item-primary:focus-visible", CSS)
        self.assertIn("prefers-reduced-motion", CSS)
        self.assertIn('aria-label="Abrir menu"', APP)
        self.assertIn('aria-label="Fechar menu"', APP)

    def test_sidebar_brand_and_settings_are_not_fake_controls(self):
        self.assertIn("Música conecta mundos.", APP)
        self.assertIn('data-bztune-system-nav', APP)
        self.assertIn("<SettingsPage", APP)
        settings = (ROOT / "doomvault" / "src" / "settings" / "SettingsPage.tsx").read_text(encoding="utf-8")
        self.assertIn("Configurações", settings)
        self.assertIn("Interface", settings)
        self.assertIn("<BZtuneVersionLabel />", APP)


if __name__ == "__main__":
    unittest.main()

"""Regressões da atualização integrada e silenciosa do BZtune Desktop."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
CONF = ROOT / "desktop" / "src-tauri" / "tauri.conf.json"
RUST = ROOT / "desktop" / "src-tauri" / "src" / "main.rs"
JS = ROOT / "doomvault" / "public" / "desktop-updates.js"
WORKFLOW = ROOT / ".github" / "workflows" / "desktop-release.yml"


class IntegratedUpdaterTests(unittest.TestCase):
    def test_nsis_updates_are_quiet_in_current_user_installations(self):
        config = json.loads(CONF.read_text(encoding="utf-8"))
        self.assertEqual(config["plugins"]["updater"]["windows"]["installMode"], "quiet")
        self.assertEqual(config["bundle"]["windows"]["nsis"]["installMode"], "currentUser")
        self.assertEqual(config["plugins"]["updater"]["endpoints"], [
            "https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json"
        ])
        self.assertNotIn("dangerousInsecureTransportProtocol", config["plugins"]["updater"])

    def test_update_ui_shows_download_progress_and_notifies_without_modal(self):
        js = JS.read_text(encoding="utf-8")
        for token in (
            'window.setTimeout(() => {',
            'if (preferences?.autoUpdates === false) return;',
            'void onCheck(true);',
            'invoke("desktop_check_update")',
            'invoke("desktop_install_update")',
            '"bztune-update-progress"',
            '"bztune-update-finished"',
            'id="bztune-update-progress"',
            'Atualizar agora</button>',
            '"has-update"',
            'aria-live="polite"',
        ):
            with self.subTest(token=token):
                self.assertIn(token, js)
        self.assertNotIn("window.confirm(", js)
        self.assertNotIn("window.alert(", js)
        self.assertIn('if (!tauri || !tauri.core', js)

    def test_updater_stays_in_sidebar_without_covering_navigation(self):
        js = JS.read_text(encoding="utf-8")
        app = (ROOT / "doomvault" / "src" / "App.tsx").read_text(encoding="utf-8")
        css = (ROOT / "doomvault" / "src" / "styles.css").read_text(encoding="utf-8")
        self.assertIn('id="bztune-desktop-update-slot"', app)
        self.assertIn('document.getElementById("bztune-desktop-update-slot")', js)
        self.assertIn("MutationObserver", js)
        self.assertIn("slot.appendChild(toggle)", js)
        self.assertNotIn("#bztune-desktop-open{position:fixed", js)
        self.assertIn("#bztune-desktop-open{position:static", js)
        self.assertIn("transform:translate(-50%,-50%)", js)
        self.assertIn("overflow-y: auto;", css)
        self.assertIn(".sidebar-updates-slot:empty", css)
        self.assertNotIn("document.body.appendChild(toggle)", js)

    def test_backend_shutdown_precedes_silent_installer_and_doesnt_race_restart(self):
        rust = RUST.read_text(encoding="utf-8")
        self.assertIn('.on_before_exit(move || stop_backend(&on_update_exit))', rust)
        self.assertIn('if let Some(child) = guard.take() { let _ = child.kill(); }', rust)
        self.assertIn("if let tauri::RunEvent::Exit = event", rust)
        self.assertIn('#[cfg(not(target_os = "windows"))]', rust)
        self.assertIn('#[cfg(target_os = "windows")]', rust)
        self.assertIn('move |chunk, total|', rust)
        self.assertIn('"bztune-update-finished"', rust)
        self.assertIn("download_and_install(", rust)

    def test_signed_release_pipeline_remains_protected(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("environment: desktop-release", workflow)
        self.assertIn("secrets.TAURI_SIGNING_PRIVATE_KEY", workflow)
        self.assertIn('BZTUNE_RELEASE_SIGNED: "1"', workflow)
        self.assertIn("createUpdaterArtifacts", (ROOT / "desktop" / "scripts" / "prepare_signing.py").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()

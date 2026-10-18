"""Testes de requisitos de instalação NSIS/WebView2, sem modificar dados do usuário."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
TAURI = ROOT / "desktop" / "src-tauri"
CONF = TAURI / "tauri.conf.json"
BUILD = ROOT / "desktop" / "scripts" / "prepare_windows.ps1"


class InstallerPrerequisitesTests(unittest.TestCase):
    def setUp(self):
        self.conf = json.loads(CONF.read_text(encoding="utf-8"))
        self.nsh = (TAURI / self.conf["bundle"]["windows"]["nsis"]["installerHooks"]).read_text(encoding="utf-8")

    def test_webview2_installs_on_demand_officially(self):
        mode = self.conf["bundle"]["windows"]["webviewInstallMode"]
        self.assertEqual(mode, {"type": "embedBootstrapper", "silent": True})
        self.assertNotEqual(mode["type"], "skip")
        self.assertNotIn("NSISdl::download", self.nsh)
        self.assertNotIn("ExecWait", self.nsh)

    def test_wizard_has_prerequisite_page_and_preserves_updater_modes(self):
        nsis = self.conf["bundle"]["windows"]["nsis"]
        self.assertEqual(nsis["installMode"], "currentUser")
        self.assertIn("PortugueseBR", nsis["languages"])
        self.assertIn("Page custom BZtunePrereqPage", self.nsh)
        self.assertIn("${Silent}", self.nsh)
        self.assertIn("$PassiveMode", self.nsh)
        self.assertIn("$UpdateMode", self.nsh)
        self.assertIn("NSIS_HOOK_PREINSTALL", self.nsh)
        self.assertIn("NSIS_HOOK_POSTINSTALL", self.nsh)
        self.assertIn("ReadRegStr", self.nsh)
        self.assertIn("F3017226-FE2A-4295-8BDF-00C3A9A7E4C5", self.nsh)

    def test_backend_and_audio_binaries_ship_with_installer(self):
        self.assertIn("binaries/bztune-backend", self.conf["bundle"]["externalBin"])
        for path in ("resources/bin/ffmpeg.exe", "resources/bin/ffprobe.exe"):
            self.assertIn(path, self.conf["bundle"]["resources"])
        pack = BUILD.read_text(encoding="utf-8")
        self.assertIn("python -m PyInstaller --onefile", pack)
        self.assertIn("Copy-Item $backend", pack)
        self.assertIn("Copy-Item $exe", pack)
        self.assertIn('IfFileExists "$INSTDIR\\bztune-backend.exe"', self.nsh)
        self.assertIn('IfFileExists "$INSTDIR\\bin\\ffmpeg.exe"', self.nsh)
        self.assertIn('IfFileExists "$INSTDIR\\bin\\ffprobe.exe"', self.nsh)

    def test_setup_does_not_run_untrusted_downloads_or_touch_library(self):
        self.assertNotIn("powershell.exe", self.nsh.lower())
        self.assertNotIn("curl", self.nsh.lower())
        self.assertNotIn("rmDir /r", self.nsh)
        self.assertNotIn("DeleteRegKey", self.nsh)
        self.assertNotIn("BZtune\\\\library", self.nsh)
        self.assertIn("createUpdaterArtifacts", self.conf["bundle"])


if __name__ == "__main__":
    unittest.main()

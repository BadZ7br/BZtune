"""Testes isolados de contrato da infraestrutura Desktop."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "desktop"


class DesktopContractTests(unittest.TestCase):
    def test_bundle_is_self_contained(self):
        conf = json.loads((DESKTOP / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))
        self.assertEqual(conf["build"]["frontendDist"], "../../doomvault/dist")
        self.assertEqual(conf["bundle"]["targets"], ["nsis"])
        self.assertIn("binaries/bztune-backend", conf["bundle"]["externalBin"][0])
        self.assertIn("resources/bin/ffmpeg.exe", conf["bundle"]["resources"])
        self.assertIn("resources/bin/ffprobe.exe", conf["bundle"]["resources"])
        self.assertEqual(
            conf["plugins"]["updater"]["endpoints"][0],
            "https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json"
        )
        self.assertFalse(conf["bundle"]["createUpdaterArtifacts"])

    def test_web_mode_never_starts_desktop_widget(self):
        code = (ROOT / "doomvault" / "public" / "desktop-updates.js").read_text(encoding="utf-8")
        self.assertIn("window.__TAURI__", code)
        self.assertIn("desktop_check_update", code)
        self.assertIn("desktop_install_update", code)
        self.assertIn("window.confirm(", code)

    def test_backend_uses_separate_user_data_directory(self):
        entry = (DESKTOP / "backend_entry.py").read_text(encoding="utf-8")
        self.assertIn('os.environ.get("LOCALAPPDATA")', entry)
        self.assertIn("BZTUNE_LIBRARY_DIR", entry)
        self.assertIn('host="127.0.0.1"', entry)
        self.assertIn("X-BZtune-Launch", entry)
        compile(entry, str(DESKTOP / "backend_entry.py"), "exec")

    def test_release_feed_refuses_unsigned_installer(self):
        script = DESKTOP / "scripts" / "make_release_feed.py"
        with tempfile.TemporaryDirectory(prefix="bztune-desktop-feed-") as d:
            folder = Path(d)
            exe = folder / "BZtune_2.0.0-setup.exe"
            exe.write_bytes(b"test-only")
            manifest = folder / "latest.json"
            cmd = [sys.executable, str(script), str(folder), "2.0.0", str(manifest)]
            rejected = subprocess.run(cmd, capture_output=True, text=True, check=False)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertFalse(manifest.exists())
            (folder / (exe.name + ".sig")).write_text("TEST_SIGNATURE_ONLY_" * 5, encoding="utf-8")
            accepted = subprocess.run(cmd, capture_output=True, text=True, check=False)
            self.assertEqual(accepted.returncode, 0, accepted.stderr)
            payload = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(payload["version"], "2.0.0")
            self.assertIn("windows-x86_64", payload["platforms"])
            self.assertIn("BZtune-Setup-v2.0.0-x64.exe", payload["platforms"]["windows-x86_64"]["url"])
            self.assertIn("https://github.com/BadZ7br/BZtune/releases/download/", payload["platforms"]["windows-x86_64"]["url"])
            self.assertTrue((folder / "BZtune-Setup-v2.0.0-x64.exe").exists())


if __name__ == "__main__":
    unittest.main()

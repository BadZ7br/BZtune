"""Verifica isoladamente RC3 -> RC4 e que o workflow nao publica releases."""
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest

from test_updater_loopback_rc2 import RCUpdaterLoopbackTests

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "desktop-updater-quiet-test.yml"
FEED = ROOT / "desktop" / "scripts" / "make_release_feed.py"
SERVER = ROOT / "desktop" / "scripts" / "serve_update_test.ps1"
CONF = ROOT / "desktop" / "src-tauri" / "tauri.conf.json"


class QuietUpdaterRC4Tests(unittest.TestCase):
    def test_new_workflow_signed_and_never_publishes_release(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        for token in (
            "workflow_dispatch:", "github.ref == 'refs/heads/main'",
            "environment: desktop-release",
            "persist-credentials: false",
            "contents: read",
            "secrets.TAURI_SIGNING_PRIVATE_KEY",
            "secrets.BZTUNE_UPDATER_PUBLIC_KEY",
            'BZTUNE_LOCAL_UPDATE_TEST: "1"',
            'BZTUNE_RELEASE_VERSION: "2.0.0-rc.3"',
            'BZTUNE_RELEASE_VERSION: "2.0.0-rc.4"',
            "BZtune-Updater-Local-RC3-to-RC4",
            "uses: actions/upload-artifact@v4",
            "desktop/RC4_QUIET_UPDATE_TEST.md",
            "retention-days: 7",
        ):
            with self.subTest(token=token):
                self.assertIn(token, text)
        for prohibited in ("gh release create", "git push", "create-release"):
            self.assertNotIn(prohibited, text)
        # As versoes RC3 e RC4 devem ser geradas uma unica vez cada.
        self.assertEqual(text.count('BZTUNE_RELEASE_VERSION: "2.0.0-rc.3"'), 1)
        self.assertEqual(text.count('BZTUNE_RELEASE_VERSION: "2.0.0-rc.4"'), 1)

    def test_client_uses_quiet_mode_without_modifying_official_endpoint(self):
        config = json.loads(CONF.read_text(encoding="utf-8"))
        self.assertEqual(config["plugins"]["updater"]["windows"]["installMode"], "quiet")
        self.assertEqual(config["bundle"]["windows"]["nsis"]["installMode"], "currentUser")
        self.assertNotIn("dangerousInsecureTransportProtocol", config["plugins"]["updater"])
        self.assertEqual(config["plugins"]["updater"]["endpoints"], [
            "https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json"
        ])

    def test_rc3_rc4_only_on_local_endpoint(self):
        helper = RCUpdaterLoopbackTests()
        for version in ("2.0.0-rc.3", "2.0.0-rc.4"):
            with self.subTest(version=version):
                process, config, cargo = helper.prepare_in_temp(version, "1")
                self.assertEqual(process.returncode, 0, process.stderr)
                self.assertEqual(config["version"], version)
                self.assertIn('version = "' + version + '"', cargo)
                self.assertEqual(config["plugins"]["updater"]["endpoints"],
                                 ["http://127.0.0.1:8765/latest.json"])
                self.assertTrue(config["plugins"]["updater"]["dangerousInsecureTransportProtocol"])

    def test_feed_rc4_is_local_and_signed(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            binary = folder / "BZtune_2.0.0-rc.4-setup.exe"
            binary.write_bytes(b"synthetic, not a runnable installer")
            (folder / (binary.name + ".sig")).write_text("TEST_SIG_" * 10, encoding="utf-8")
            out = folder / "latest.json"
            p = subprocess.run([
                sys.executable, str(FEED), str(folder), "2.0.0-rc.4",
                str(out), "--local-loopback"
            ], text=True, capture_output=True, check=False)
            self.assertEqual(p.returncode, 0, p.stderr)
            info = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(info["version"], "2.0.0-rc.4")
            self.assertEqual(info["platforms"]["windows-x86_64"]["url"],
                             "http://127.0.0.1:8765/BZtune-Setup-v2.0.0-rc.4-x64.exe")
            self.assertEqual(info["platforms"]["windows-x86_64"]["signature"],
                             "TEST_SIG_" * 10)

    def test_server_validates_versions_and_only_listens_localhost(self):
        code = SERVER.read_text(encoding="utf-8")
        self.assertIn('"2.0.0-rc.2", "2.0.0-rc.4"', code)
        self.assertIn("[System.Net.IPAddress]::Loopback", code)
        self.assertIn('ContainsKey($parts[1])', code)
        self.assertIn("http://127.0.0.1:8765", code)


if __name__ == "__main__":
    unittest.main()

"""Testa isolamento do updater local RC1/RC2; nunca usa secrets reais."""
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PREPARE = ROOT / "desktop" / "scripts" / "prepare_signing.py"
FEED = ROOT / "desktop" / "scripts" / "make_release_feed.py"
WORKFLOW = ROOT / ".github" / "workflows" / "desktop-updater-loopback-test.yml"
SERVER = ROOT / "desktop" / "scripts" / "serve_update_test.ps1"


def synthetic_pubkey():
    body = base64.b64encode(b"Ed" + b"TESTID01" + bytes(32)).decode()
    block = "untrusted comment: minisign public key\n" + body + "\n"
    return base64.b64encode(block.encode()).decode()


class RCUpdaterLoopbackTests(unittest.TestCase):
    def test_workflow_does_not_publish_and_uses_protected_secrets(self):
        source = WORKFLOW.read_text(encoding="utf-8")
        for text in (
            "workflow_dispatch:",
            "github.ref == 'refs/heads/main'",
            "environment: desktop-release",
            "contents: read",
            "persist-credentials: false",
            "secrets.TAURI_SIGNING_PRIVATE_KEY",
            "secrets.BZTUNE_UPDATER_PUBLIC_KEY",
            'BZTUNE_LOCAL_UPDATE_TEST: "1"',
            'BZTUNE_RELEASE_VERSION: "2.0.0-rc.1"',
            'BZTUNE_RELEASE_VERSION: "2.0.0-rc.2"',
            "actions/upload-artifact@v4",
            "retention-days: 7",
        ):
            self.assertIn(text, source)
        self.assertNotIn("gh release create", source)
        self.assertNotIn("git push", source)
        self.assertNotIn("actions/create-release", source)

    def test_server_only_serves_allowlisted_files_on_loopback(self):
        source = SERVER.read_text(encoding="utf-8")
        self.assertIn("[System.Net.IPAddress]::Loopback", source)
        self.assertIn('"/latest.json"', source)
        self.assertIn('"/$installer"', source)
        self.assertIn('ContainsKey($parts[1])', source)
        self.assertIn('".sig"', source.replace("$installerPath.sig", '".sig"'))

    def prepare_in_temp(self, version, test_mode):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "desktop"
            script = root / "scripts" / "prepare_signing.py"
            script.parent.mkdir(parents=True)
            tauri = root / "src-tauri"
            tauri.mkdir()
            shutil.copyfile(PREPARE, script)
            conf = tauri / "tauri.conf.json"
            conf.write_text(
                json.dumps({
                    "version": "2.0.0-alpha.2",
                    "bundle": {"createUpdaterArtifacts": False},
                    "plugins": {"updater": {
                        "pubkey": "PLACEHOLDER",
                        "endpoints": ["https://example.org/latest.json"]
                    }}
                }), encoding="utf-8"
            )
            (tauri / "Cargo.toml").write_text(
                '[package]\nversion = "2.0.0-alpha.2"\n', encoding="utf-8"
            )
            env = dict(os.environ)
            env.update({
                "BZTUNE_RELEASE_VERSION": version,
                "BZTUNE_LOCAL_UPDATE_TEST": test_mode,
                "BZTUNE_UPDATER_PUBLIC_KEY": synthetic_pubkey(),
            })
            p = subprocess.run(
                [sys.executable, str(script)], env=env,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )
            config = json.loads(conf.read_text(encoding="utf-8"))
            cargo = (tauri / "Cargo.toml").read_text(encoding="utf-8")
            return p, config, cargo

    def test_test_versions_only_use_local_endpoint(self):
        for version in ("2.0.0-rc.1", "2.0.0-rc.2"):
            with self.subTest(version=version):
                p, conf, cargo = self.prepare_in_temp(version, "1")
                self.assertEqual(p.returncode, 0, p.stderr)
                self.assertEqual(conf["version"], version)
                self.assertIn('version = "' + version + '"', cargo)
                self.assertTrue(conf["bundle"]["createUpdaterArtifacts"])
                updater = conf["plugins"]["updater"]
                self.assertEqual(updater["endpoints"], ["http://127.0.0.1:8765/latest.json"])
                self.assertIs(updater["dangerousInsecureTransportProtocol"], True)

    def test_production_never_enables_insecure_transport(self):
        p, conf, _ = self.prepare_in_temp("2.0.0", "0")
        self.assertEqual(p.returncode, 0, p.stderr)
        updater = conf["plugins"]["updater"]
        self.assertNotIn("dangerousInsecureTransportProtocol", updater)
        self.assertEqual(updater["endpoints"], ["https://example.org/latest.json"])

    def test_test_mode_rejects_stable_or_invalid_flag(self):
        for version, mode in (("2.0.0", "1"), ("2.0.0-rc.2", "yes")):
            with self.subTest(version=version, mode=mode):
                p, conf, cargo = self.prepare_in_temp(version, mode)
                self.assertNotEqual(p.returncode, 0)
                self.assertEqual(conf["version"], "2.0.0-alpha.2")
                self.assertIn('version = "2.0.0-alpha.2"', cargo)

    def test_feed_local_and_production_are_separate(self):
        for local in (True, False):
            with self.subTest(local=local), tempfile.TemporaryDirectory() as tmp:
                folder = Path(tmp)
                exe = folder / "unsigned-name-setup.exe"
                exe.write_bytes(b"test payload (not a real installer)")
                sig = folder / (exe.name + ".sig")
                sig.write_text("TEST_SIGNATURE_" * 6, encoding="utf-8")
                feed = folder / "latest.json"
                args = [sys.executable, str(FEED), str(folder), "2.0.0-rc.2", str(feed)]
                if local:
                    args.append("--local-loopback")
                p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                self.assertEqual(p.returncode, 0, p.stderr)
                manifest = json.loads(feed.read_text(encoding="utf-8"))
                url = manifest["platforms"]["windows-x86_64"]["url"]
                if local:
                    self.assertEqual(url, "http://127.0.0.1:8765/BZtune-Setup-v2.0.0-rc.2-x64.exe")
                else:
                    self.assertEqual(url, "https://github.com/BadZ7br/BZtune/releases/download/v2.0.0-rc.2/BZtune-Setup-v2.0.0-rc.2-x64.exe")
                self.assertTrue((folder / "BZtune-Setup-v2.0.0-rc.2-x64.exe.sig").exists())


if __name__ == "__main__":
    unittest.main()

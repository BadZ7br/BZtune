"""Testa a integridade do pacote de release sem utilizar secrets reais."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "desktop" / "scripts" / "validate_release_bundle.py"
spec = importlib.util.spec_from_file_location("bztune_release_validator", SCRIPT)
assert spec and spec.loader
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class ReleaseBundleValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / "nsis"
        self.folder.mkdir()
        self.version = "2.0.0"
        self.exe = self.folder / "BZtune-Setup-v2.0.0-x64.exe"
        self.sig = self.folder / (self.exe.name + ".sig")
        self.exe.write_bytes(b"synthetic executable: never run")
        self.sig.write_text("SYNTHETIC_SIGNATURE_" * 5, encoding="utf-8")
        self.feed = self.root / "latest.json"
        self.manifest = {
            "version": self.version,
            "notes": "BZtune Desktop 2.0.0",
            "platforms": {
                "windows-x86_64": {
                    "signature": self.sig.read_text(encoding="utf-8"),
                    "url": (
                        "https://github.com/BadZ7br/BZtune/releases/download/v2.0.0/"
                        "BZtune-Setup-v2.0.0-x64.exe"
                    ),
                }
            },
        }
        self.save()

    def save(self):
        self.feed.write_text(json.dumps(self.manifest), encoding="utf-8")

    def validate(self, stable=True):
        return validator.validate_release_bundle(
            self.folder, self.feed, self.version, stable=stable
        )

    def test_valid_stable_package(self):
        result = self.validate()
        self.assertEqual(result["version"], "2.0.0")
        self.assertEqual(result["platform"], "windows-x86_64")

    def test_wrong_version_is_rejected(self):
        self.manifest["version"] = "2.0.1"
        self.save()
        with self.assertRaisesRegex(ValueError, "Versão"):
            self.validate()

    def test_local_http_and_wrong_https_are_rejected(self):
        for url in (
            "http://127.0.0.1:8765/BZtune-Setup-v2.0.0-x64.exe",
            "https://example.org/malware.exe",
            "https://github.com/BadZ7br/BZtune/releases/download/v9.9.9/"
            "BZtune-Setup-v2.0.0-x64.exe",
        ):
            with self.subTest(url=url):
                self.manifest["platforms"]["windows-x86_64"]["url"] = url
                self.save()
                with self.assertRaisesRegex(ValueError, "URL"):
                    self.validate()

    def test_modified_signature_is_rejected(self):
        self.manifest["platforms"]["windows-x86_64"]["signature"] = "BAD"
        self.save()
        with self.assertRaisesRegex(ValueError, "Assinatura"):
            self.validate()

    def test_missing_or_empty_exe_is_rejected(self):
        self.exe.unlink()
        with self.assertRaisesRegex(ValueError, "Instalador"):
            self.validate()
        self.exe.write_bytes(b"")
        with self.assertRaisesRegex(ValueError, "Instalador"):
            self.validate()

    def test_unexpected_platform_is_rejected(self):
        self.manifest["platforms"]["windows-x86_64"]["signature"] = "x"
        self.manifest["platforms"]["windows-arm64"] = {"signature": "x", "url": "x"}
        self.save()
        with self.assertRaisesRegex(ValueError, "Plataformas"):
            self.validate()

    def test_release_candidate_cannot_be_published_as_stable(self):
        with self.assertRaisesRegex(ValueError, "estável"):
            validator.validate_release_bundle(
                self.folder, self.feed, "2.0.0-rc.4", stable=True
            )

    def test_manifest_does_not_hide_multiple_installers(self):
        (self.folder / "BZtune-Setup-v2.0.1-x64.exe").write_bytes(b"other")
        with self.assertRaisesRegex(ValueError, "versões diferentes"):
            self.validate()


if __name__ == "__main__":
    unittest.main()

"""Testa a integridade do pacote de release sem utilizar secrets reais."""
from __future__ import annotations

import importlib.util
import base64
import os
import subprocess
from unittest.mock import patch
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
        signed = self.sign()
        self.key = signed["key"]
        self.sig.write_text(signed["signature"], encoding="utf-8")
        self.config = self.root / "tauri.conf.json"
        self.config.write_text(json.dumps({"plugins": {"updater": {"pubkey": self.key}}}), encoding="utf-8")
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

    def sign(self, comment="timestamp:0\tfile:test.exe\tversion:2.0.0", legacy=False, seed=1):
        result = subprocess.run(
            ["node", str(ROOT / "tests/release_signature_fixture.mjs")],
            input=json.dumps({"data": base64.b64encode(self.exe.read_bytes()).decode("ascii"),
                              "comment": comment, "legacy": legacy, "seed": seed}),
            capture_output=True, text=True, check=True,
        )
        return json.loads(result.stdout)

    def replace_signature(self, value):
        self.sig.write_text(value, encoding="utf-8")
        self.manifest["platforms"]["windows-x86_64"]["signature"] = value
        self.save()

    def save(self):
        self.feed.write_text(json.dumps(self.manifest), encoding="utf-8")

    def validate(self, stable=True):
        return validator.validate_release_bundle(
            self.folder, self.feed, self.version, stable=stable, public_key=self.key, config_path=self.config
        )

    def test_valid_stable_package(self):
        result = self.validate()
        self.assertEqual(result["version"], "2.0.0")
        self.assertEqual(result["platform"], "windows-x86_64")
        self.assertTrue(result["signature_verified"])

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

    def test_modified_executable_fails_even_when_sig_and_manifest_match(self):
        self.exe.write_bytes(b"changed executable: never run")
        with self.assertRaisesRegex(ValueError, "criptográfica"):
            self.validate()

    def test_gibberish_signature_matching_both_files_is_rejected(self):
        self.replace_signature("SYNTHETIC_SIGNATURE_" * 5)
        with self.assertRaisesRegex(ValueError, "Minisign"):
            self.validate()

    def test_other_signing_key_with_the_same_key_id_is_rejected(self):
        self.replace_signature(self.sign(seed=2)["signature"])
        with self.assertRaisesRegex(ValueError, "criptográfica"):
            self.validate()

    def test_authenticated_comment_tampering_is_rejected(self):
        text = base64.b64decode(self.sig.read_text()).decode().replace("version:2.0.0", "version:2.0.1")
        self.replace_signature(base64.b64encode(text.encode()).decode())
        with self.assertRaisesRegex(ValueError, "criptográfica"):
            self.validate()

    def test_authenticated_wrong_version_is_rejected(self):
        self.replace_signature(self.sign(comment="version:2.0.1")["signature"])
        with self.assertRaisesRegex(ValueError, "Versão autenticada"):
            self.validate()

    def test_configured_key_must_match_expected_public_key(self):
        other = self.sign(seed=2)["key"]
        self.config.write_text(json.dumps({"plugins": {"updater": {"pubkey": other}}}))
        with self.assertRaisesRegex(ValueError, "Chave pública do aplicativo difere"):
            self.validate()

    def test_missing_expected_public_key_blocks_validation(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "Chave pública"):
                validator.validate_release_bundle(self.folder, self.feed, self.version)

    def test_legacy_tauri_signature_is_verified(self):
        self.replace_signature(self.sign(comment="timestamp:0\tfile:test.exe", legacy=True)["signature"])
        self.assertTrue(self.validate()["signature_verified"])
        self.exe.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "criptográfica"):
            self.validate()

    def test_required_authenticated_version_cannot_be_missing(self):
        self.replace_signature(self.sign(comment="timestamp:0")["signature"])
        self.config.write_text(json.dumps({"plugins": {"updater": {"pubkey": self.key, "requireSignedVersion": True}}}))
        with self.assertRaisesRegex(ValueError, "sem versão autenticada"):
            self.validate()

    def test_missing_verifier_or_verifier_timeout_blocks_validation(self):
        for failure in [FileNotFoundError(), subprocess.TimeoutExpired("node", 120)]:
            with self.subTest(failure=type(failure).__name__):
                with patch.object(validator.subprocess, "run", side_effect=failure):
                    with self.assertRaisesRegex(ValueError, "Verificador criptográfico indisponível"):
                        self.validate()

    def test_cli_requires_expected_key_and_validates_build_config(self):
        command = [os.sys.executable, str(SCRIPT), str(self.folder), self.version, str(self.feed), "--stable", "--config", str(self.config)]
        environment = dict(os.environ, BZTUNE_UPDATER_PUBLIC_KEY=self.key)
        result = subprocess.run(command, env=environment, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("assinatura criptográfica validados", result.stdout)
        environment.pop("BZTUNE_UPDATER_PUBLIC_KEY")
        result = subprocess.run(command, env=environment, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Release bloqueado", result.stderr)

    def test_upstream_minisign_vectors_match_the_tauri_signature_format(self):
        # Public test vectors from minisign-verify 0.3.0, also used by Tauri's plugin.
        key_text = "untrusted comment: minisign public key E7620F1842B4E81F\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3\n"
        self.key = base64.b64encode(key_text.encode()).decode()
        self.config.write_text(json.dumps({"plugins": {"updater": {"pubkey": self.key}}}))
        vectors = [
            "untrusted comment: signature from minisign secret key\nRWQf6LRCGA9i59SLOFxz6NxvASXDJeRtuZykwQepbDEGt87ig1BNpWaVWuNrm73YiIiJbq71Wi+dP9eKL8OC351vwIasSSbXxwA=\ntrusted comment: timestamp:1555779966\tfile:test\nQtKMXWyYcwdpZAlPF7tE2ENJkRd1ujvKjlj1m9RtHTBnZPa5WKU5uWRs5GoP5M/VqE81QFuMKI5k/SfNQUaOAA==\n",
            "untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1633700835\tfile:test\tprehashed\nwLMDjy9FLAuxZ3q4NlEvkgtyhrr0gtTu6KC4KBJdITbbOeAi1zBIYo0v4iTgt8jJpIidRJnp94ABQkJAgAooBQ==\n",
        ]
        for signature in vectors:
            with self.subTest(prehashed="prehashed" in signature):
                self.exe.write_bytes(b"test")
                self.replace_signature(base64.b64encode(signature.encode()).decode())
                self.assertTrue(self.validate()["signature_verified"])
                self.exe.write_bytes(b"Test")
                with self.assertRaisesRegex(ValueError, "criptográfica"):
                    self.validate()


if __name__ == "__main__":
    unittest.main()

"""Regression tests for Tauri v2 updater public keys.

Synthetic public keys only: no production secrets are read from GitHub.
"""
from __future__ import annotations

import base64
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "desktop" / "scripts" / "prepare_signing.py"

spec = importlib.util.spec_from_file_location("bztune_signing_test_script", SCRIPT)
assert spec is not None and spec.loader is not None
script = importlib.util.module_from_spec(spec)
spec.loader.exec_module(script)


def fake_public_key() -> str:
    """A representative two-line minisign public key, encoded for Tauri."""
    minisign_body = base64.b64encode(b"Ed" + b"TESTID01" + bytes(32)).decode("ascii")
    text = "untrusted comment: minisign public key\n" + minisign_body + "\n"
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


class TauriPublicKeyValidationTests(unittest.TestCase):
    def test_valid_cli_generated_format_is_accepted_unchanged(self):
        value = fake_public_key()
        self.assertEqual(script.validate_public_key(value), value)

    def test_whitespace_around_secret_is_ignored(self):
        value = fake_public_key()
        self.assertEqual(script.validate_public_key("\n " + value + "\r\n"), value)

    def test_raw_or_corrupt_content_is_rejected(self):
        good = fake_public_key()
        bad = [
            "",
            "invalid",
            "untrusted comment: minisign public key\nRW...",
            base64.b64encode(b"untrusted comment: x\ninvalid\n").decode(),
            base64.b64encode(b"untrusted comment: x\n" +
                            base64.b64encode(b"Ed" + b"0" * 7) + b"\n").decode(),
            base64.b64encode(b"not a minisign public key").decode(),
            good[:-3] + "***",
        ]
        for value in bad:
            with self.subTest(value_preview=value[:12]):
                with self.assertRaises(ValueError):
                    script.validate_public_key(value)

    def test_source_keeps_updater_artifacts_enabled(self):
        src = SCRIPT.read_text(encoding="utf-8")
        self.assertIn('config["bundle"]["createUpdaterArtifacts"] = True', src)
        self.assertIn('config["plugins"]["updater"]["pubkey"] = public_key', src)
        self.assertIn("--check-public-key", src)


if __name__ == "__main__":
    unittest.main()

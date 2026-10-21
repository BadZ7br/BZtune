"""Explicit release requests must match every version before signing is allowed."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bztune_release_request', ROOT / 'desktop/scripts/release_request.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class ReleaseRequestTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.write('desktop/release-request.json', {'version': '2.0.7', 'publish': True, 'confirmation': 'PUBLICAR v2.0.7'})
        self.write('desktop/src-tauri/tauri.conf.json', {'version': '2.0.7'})
        self.write('desktop/package.json', {'version': '2.0.7'})
        self.write('desktop/package-lock.json', {'version': '2.0.7', 'packages': {'': {'version': '2.0.7'}}})
        (self.root / 'desktop/src-tauri/Cargo.toml').write_text('[package]\nversion="2.0.7"\n')
        (self.root / 'desktop/src-tauri/Cargo.lock').write_text('[[package]]\nname="bztune-desktop"\nversion="2.0.7"\n')

    def write(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding='utf-8')

    def test_valid_explicit_request_has_sanitized_outputs(self):
        self.assertEqual(release.read_request(self.root), {'version': '2.0.7', 'publish': 'true', 'confirmation': 'PUBLICAR v2.0.7'})

    def test_unconfirmed_or_string_publish_is_rejected(self):
        for publish, confirmation in [(False, 'PUBLICAR v2.0.7'), ('true', 'PUBLICAR v2.0.7'), (True, 'PUBLICAR v2.0.6')]:
            with self.subTest(publish=publish, confirmation=confirmation):
                self.write('desktop/release-request.json', {'version': '2.0.7', 'publish': publish, 'confirmation': confirmation})
                with self.assertRaisesRegex(ValueError, 'confirmação'):
                    release.read_request(self.root)

    def test_prerelease_and_output_injection_are_rejected(self):
        for version in ['2.0.7-rc.1', '2.0.7\npublish=true', '3.0.0']:
            self.write('desktop/release-request.json', {'version': version, 'publish': True, 'confirmation': f'PUBLICAR v{version}'})
            with self.assertRaisesRegex(ValueError, 'estável'):
                release.read_request(self.root)

    def test_rc_build_never_requests_publication(self):
        version = '2.0.9-rc.1'
        self.write('desktop/release-request.json', {'version': version, 'publish': False, 'confirmation': ''})
        for name in ['desktop/src-tauri/tauri.conf.json', 'desktop/package.json']:
            self.write(name, {'version': version})
        self.write('desktop/package-lock.json', {'version': version, 'packages': {'': {'version': version}}})
        (self.root / 'desktop/src-tauri/Cargo.toml').write_text(f'[package]\nversion="{version}"\n')
        (self.root / 'desktop/src-tauri/Cargo.lock').write_text(f'[[package]]\nname="bztune-desktop"\nversion="{version}"\n')
        self.assertEqual(release.read_request(self.root), {'version': version, 'publish': 'false', 'confirmation': ''})

    def test_test_mode_requires_rc_and_rejects_publication_confirmation(self):
        for version, confirmation in [('2.0.9', ''), ('2.0.9-rc.1', 'PUBLICAR v2.0.9'), ('2.0.9-rc.1\npublish=true', ''), ('2.0.9-rc.0', '')]:
            self.write('desktop/release-request.json', {'version': version, 'publish': False, 'confirmation': confirmation})
            with self.subTest(version=version, confirmation=confirmation), self.assertRaises(ValueError):
                release.read_request(self.root)

    def test_mismatched_package_or_lock_blocks_publication(self):
        for name, value in [('desktop/package.json', {'version': '2.0.6'}),
                            ('desktop/package-lock.json', {'version': '2.0.7', 'packages': {'': {'version': '2.0.6'}}})]:
            with self.subTest(name=name):
                before = (self.root / name).read_text(encoding='utf-8')
                self.write(name, value)
                with self.assertRaisesRegex(ValueError, 'mesma versão'):
                    release.read_request(self.root)
                (self.root / name).write_text(before, encoding='utf-8')

    def test_push_trigger_is_limited_to_request_on_protected_main(self):
        workflow = (ROOT / '.github/workflows/desktop-release.yml').read_text(encoding='utf-8')
        self.assertIn('branches: [main]', workflow)
        self.assertIn('paths: ["desktop/release-request.json"]', workflow)
        self.assertIn("if: github.ref == 'refs/heads/main'", workflow)
        self.assertIn('environment: desktop-release', workflow)
        self.assertIn('python desktop/scripts/release_request.py', workflow)
        self.assertLess(workflow.index('python desktop/scripts/release_request.py'), workflow.index('secrets.TAURI_SIGNING_PRIVATE_KEY'))

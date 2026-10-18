"""Garantias de segurança do release assinado do BZtune Desktop.

Valida o fluxo declarativo sem acessar segredos, publicar releases ou executar o instalador.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "desktop-release.yml"
FEED = ROOT / "desktop" / "scripts" / "make_release_feed.py"
CONFIG = ROOT / "desktop" / "scripts" / "prepare_signing.py"


class SignedReleaseWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")
        cls.feed = FEED.read_text(encoding="utf-8")
        cls.signing = CONFIG.read_text(encoding="utf-8")

    def test_signing_requires_protected_main_branch(self):
        self.assertIn("github.ref == 'refs/heads/main'", self.workflow)
        self.assertIn("environment: desktop-release", self.workflow)
        self.assertIn("secrets.TAURI_SIGNING_PRIVATE_KEY", self.workflow)
        self.assertIn("secrets.BZTUNE_UPDATER_PUBLIC_KEY", self.workflow)
        self.assertIn("persist-credentials: false", self.workflow)

    def test_default_dry_run_does_not_publish(self):
        self.assertIn("      publish:", self.workflow)
        self.assertIn("        default: false", self.workflow)
        self.assertIn("if: ${{ !inputs.publish }}", self.workflow)
        self.assertIn("if: ${{ inputs.publish }}", self.workflow)
        self.assertIn("uses: actions/upload-artifact@v4", self.workflow)
        self.assertIn("retention-days: 7", self.workflow)

    def test_only_stable_version_can_be_public(self):
        self.assertIn("$env:PUBLISH -eq 'true'", self.workflow)
        self.assertIn("Release oficial exige uma versão estável", self.workflow)
        self.assertIn("gh release create", self.workflow)

    def test_publish_requires_exact_confirmation_and_verified_assets(self):
        self.assertIn("      release_confirmation:", self.workflow)
        self.assertIn("        default: \"\"", self.workflow)
        self.assertIn("RELEASE_CONFIRMATION: ${{ inputs.release_confirmation }}", self.workflow)
        self.assertIn('PUBLICAR v$env:VERSION', self.workflow)
        self.assertIn("validate_release_bundle.py", self.workflow)
        self.assertIn("latest.json --stable", self.workflow)
        self.assertLess(
            self.workflow.index("validate_release_bundle.py"),
            self.workflow.index("gh release create"),
        )

    def test_latest_json_requires_real_signature(self):
        self.assertIn('glob("*-setup.exe")', self.feed)
        self.assertIn('".sig"', self.feed)
        self.assertIn('"signature": signature', self.feed)
        self.assertIn("createUpdaterArtifacts", self.signing)
        self.assertIn("BZTUNE_UPDATER_PUBLIC_KEY", self.signing)


if __name__ == "__main__":
    unittest.main()

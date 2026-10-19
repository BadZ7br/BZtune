"""Regressões para avisos temporários e player expandido sem rolagem global.

Não altera música real, não requer download nem publica Releases.
"""
import re
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "doomvault" / "src" / "styles.css").read_text(encoding="utf-8")
DOWNLOAD = (ROOT / "doomvault" / "src" / "library" / "CatalogDownloadButton.tsx").read_text(encoding="utf-8")
PLAYER = (ROOT / "doomvault" / "src" / "player" / "MusicPlayer.tsx").read_text(encoding="utf-8")


def body_for(selector: str) -> str:
    """Encontra o primeiro bloco de seletor literal, sem atravessar chaves."""
    pat = re.compile(re.escape(selector) + r"\s*\{([^{}]*)\}")
    match = pat.search(CSS)
    if not match:
        raise AssertionError(f"Bloco CSS não encontrado: {selector}")
    return match.group(1)


class DownloadTransientNoticeTests(unittest.TestCase):
    def test_terminal_download_notice_is_transient(self):
        self.assertIn("const [feedbackVisible, setFeedbackVisible] = useState(false)", DOWNLOAD)
        self.assertIn("setTimeout(() => setFeedbackVisible(false), 6000)", DOWNLOAD)
        self.assertIn("window.clearTimeout(timeout)", DOWNLOAD)
        self.assertIn("[batch?.status, message]", DOWNLOAD)
        self.assertIn("const showFeedback = Boolean(message || batch) && (working || feedbackVisible)", DOWNLOAD)
        self.assertIn("{showFeedback &&", DOWNLOAD)
        self.assertIn('aria-label="Fechar aviso de download"', DOWNLOAD)

    def test_polling_stops_when_download_finishes(self):
        self.assertIn('result.status === "complete" || result.status === "partial" || result.status === "error"', DOWNLOAD)
        self.assertIn("setBatchId(null); // Para de consultar", DOWNLOAD)
        self.assertIn("window.clearInterval(timer)", DOWNLOAD)
        self.assertIn("setMessage(\"\");", DOWNLOAD)
        self.assertIn('friendlyDownloadMessage(batch.errors[0])', DOWNLOAD)

    def test_dismiss_control_has_click_area(self):
        dismiss = body_for(".dv-catalog-download-message .dv-catalog-dismiss")
        self.assertIn("min-width: 24px", dismiss)
        self.assertIn("min-height: 24px", dismiss)
        self.assertIn("cursor: pointer", dismiss)


class FullPlayerViewportTests(unittest.TestCase):
    def test_fullscreen_is_fixed_with_no_page_scroll(self):
        root = body_for(".dv-player.bz32-full")
        self.assertIn("position: fixed !important", root)
        self.assertIn("height: 100dvh !important", root)
        self.assertIn("overflow: hidden !important", root)
        self.assertNotIn("overflow-y: auto", root)

        center = body_for(".bz32-full .bz32-center")
        self.assertIn("overflow: visible !important", center)
        self.assertNotIn("overflow-y: auto", center)

    def test_player_fits_window_and_queue_remains_scrollable(self):
        shell = body_for(".bz32-full .bz32-shell")
        self.assertIn("height: min(720px, calc(100dvh - 24px))", shell)
        self.assertIn("min-height: 0", shell)
        self.assertIn("overflow: hidden", shell)
        queue = body_for(".bz32-queue-scroll")
        self.assertIn("overflow-y: auto", queue)
        full_queue = body_for(".bz32-full .bz32-queue")
        self.assertIn("height: 100%", full_queue)
        self.assertIn("max-height: 100%", full_queue)
        self.assertIn("html:has(.dv-player.bz32-full)", CSS)
        self.assertIn("body:has(.dv-player.bz32-full)", CSS)

    def test_compact_layout_and_recovery_ui_preserved(self):
        self.assertIn("@media (min-width: 901px) and (max-height: 760px)", CSS)
        self.assertIn("@media (max-width: 900px)", CSS)
        self.assertIn("--bz32-artwork-height-limit: 46dvh", CSS)
        self.assertIn("object-fit: contain !important", CSS)
        self.assertIn(".bz-online-recovery", CSS)
        self.assertIn("bz32-queue-scroll", PLAYER)
        self.assertIn("bz32-shortcuts", PLAYER)

    def test_no_new_global_important_override_sprawl(self):
        self.assertLessEqual(CSS.count("!important"), 185)


if __name__ == "__main__":
    unittest.main()

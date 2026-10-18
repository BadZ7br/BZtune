"""Regressões do CSS consolidado, sem navegador ou dependências externas."""
import re
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "doomvault" / "src" / "styles.css"


def rule_body(source: str, selector: str):
    pattern = re.compile(r"(?m)^" + re.escape(selector) + r"\s*\{")
    return [source[m.end():source.index("}", m.end())] for m in pattern.finditer(source)]


class CSSConsistencyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.css = CSS.read_text(encoding="utf-8")

    def test_balanced_blocks_comments_quotes_and_parentheses(self):
        """Delimitadores CSS não estruturais em strings e funções são ignorados."""
        source = self.css
        depth = parens = brackets = 0
        quote = None
        escaped = False
        in_comment = False
        i = 0
        while i < len(source):
            c = source[i]
            following = source[i + 1] if i + 1 < len(source) else ""
            if in_comment:
                if c == "*" and following == "/":
                    in_comment = False
                    i += 2
                    continue
                i += 1
                continue
            if quote is not None:
                if escaped:
                    escaped = False
                elif c == "\\":
                    escaped = True
                elif c == quote:
                    quote = None
                i += 1
                continue
            if c == "/" and following == "*":
                in_comment = True
                i += 2
                continue
            if c in ("'", '"'):
                quote = c
            elif c == "(":
                parens += 1
            elif c == ")":
                parens -= 1
                self.assertGreaterEqual(parens, 0)
            elif c == "[":
                brackets += 1
            elif c == "]":
                brackets -= 1
                self.assertGreaterEqual(brackets, 0)
            elif not parens and not brackets and c == "{":
                depth += 1
            elif not parens and not brackets and c == "}":
                depth -= 1
                self.assertGreaterEqual(depth, 0)
            i += 1
        self.assertEqual((depth, parens, brackets), (0, 0, 0))
        self.assertIsNone(quote)
        self.assertFalse(in_comment)

    def test_cascade_us_services_retains_final_flex_layout(self):
        blocks = rule_body(self.css, ".us-services")
        self.assertEqual(len(blocks), 1)
        self.assertNotIn("display: grid", blocks[0])
        self.assertNotIn("grid-template-columns", blocks[0])
        self.assertIn("margin-top: auto", blocks[0])
        self.assertRegex(
            self.css,
            r"(?s)\.ap-links,\s*\.dv-links,\s*\.us-services,\s*\.ge-links\s*\{[^}]*display: flex;"
        )

    def test_download_row_uses_single_gap_value(self):
        blocks = rule_body(self.css, ".dv-song-download-row")
        self.assertEqual(len(blocks), 2)
        self.assertEqual(sum("gap: 10px" in block for block in blocks), 1)
        self.assertFalse(any("gap: 8px" in block for block in blocks))

    def test_playlist_picker_does_not_reintroduce_obsolete_height(self):
        blocks = rule_body(self.css, ".pl-add-list")
        self.assertEqual(len(blocks), 1)
        self.assertIn("max-height: 360px", blocks[0])
        self.assertNotIn("380px", blocks[0])

    def test_player_override_intent_and_mobile_rules_preserved(self):
        self.assertIn(
            "as configurações usam 2 colunas; EQ usa as 3 colunas",
            self.css
        )
        self.assertIn(".bz32-full .bz32-media .bz32-artwork img", self.css)
        self.assertIn("object-fit: contain !important", self.css)
        self.assertIn("@media(max-width:640px)", self.css)

    def test_rules_formatted_and_important_not_increased(self):
        self.assertNotRegex(self.css, r"(?m)\{[^\n]*[a-z-]+:\s*[^{}]+\}")
        self.assertLessEqual(self.css.count("!important"), 185)
        self.assertEqual(self.css.count("@import "), 1)
        self.assertIn("font-family", self.css)


if __name__ == "__main__":
    unittest.main()

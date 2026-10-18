"""BZtune v1.4.2 — testes do detector, sem Flask nem banco real."""
from __future__ import annotations
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "doomvault-api"))
from api.library_duplicates import scan_duplicates  # noqa: E402


def row(track_id, title, artist="Black Sabbath", album="Black Sabbath", sha=None, year=None):
    return dict(id=track_id, title=title, artist=artist, album=album,
                sha256=sha or (track_id * 64)[:64], filename=title + ".mp3",
                bytes=123456, mime="audio/mpeg", year=year, track_number=None)


class DuplicateDetectorTests(unittest.TestCase):
    def test_same_title_and_artist_different_hash_requires_review(self):
        report = scan_duplicates([row("a", "The Wizard"), row("b", "The Wizard")])
        self.assertEqual(report["summary"], dict(identical=0, possible=1, versions=0))
        self.assertEqual(report["groups"][0]["confidence"], "review")

    def test_different_artists_not_merged(self):
        report = scan_duplicates([row("a", "The Wizard", "Black Sabbath"), row("b", "The Wizard", "Other Band")])
        self.assertEqual(report["groups"], [])

    def test_remaster_different_version(self):
        report = scan_duplicates([row("a", "The Wizard"), row("b", "The Wizard (2009 Remaster)")])
        self.assertEqual(report["summary"]["versions"], 1)
        self.assertEqual(report["summary"]["possible"], 0)

    def test_live_in_song_title_is_not_automatically_a_version(self):
        report = scan_duplicates([row("a", "Live and Let Die"), row("b", "Live and Let Die")])
        self.assertEqual(report["summary"]["possible"], 1)

    def test_hash_identical_marked_confirmed(self):
        same_hash = "f" * 64
        report = scan_duplicates([row("a", "Track", sha=same_hash), row("b", "Track", sha=same_hash)])
        self.assertEqual(report["summary"]["identical"], 1)
        self.assertEqual(report["groups"][0]["confidence"], "confirmed")

    def test_different_album_counts_as_version_or_release(self):
        report = scan_duplicates([row("a", "Solitude", album="Master of Reality"),
                                  row("b", "Solitude", album="Greatest Hits")])
        self.assertEqual(report["summary"]["versions"], 1)

    def test_accents_and_punctuation_normalized(self):
        report = scan_duplicates([row("a", "Canción!") , row("b", "Cancion")])
        self.assertEqual(report["summary"]["possible"], 1)

    def test_empty_and_missing_data_safe(self):
        self.assertEqual(scan_duplicates([])["groups"], [])
        self.assertEqual(scan_duplicates([row("a", "", artist="")])["groups"], [])

    def test_input_never_modified(self):
        rows=[row("a", "The Wizard"),row("b", "The Wizard")]
        original=[dict(item) for item in rows]
        scan_duplicates(rows)
        self.assertEqual(rows,original)


if __name__ == "__main__":
    unittest.main()

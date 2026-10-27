import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'doomvault-api'))
from services.music_identity import normalize_name
from api.library_duplicates import scan_duplicates

class UnicodeIdentityTests(unittest.TestCase):
    def test_marks_are_removed_only_for_latin(self):
        self.assertEqual(normalize_name('Motörhead'),normalize_name('Motorhead'))
        self.assertNotEqual(normalize_name('ガ'),normalize_name('カ'))
        self.assertNotEqual(normalize_name('東京'),normalize_name('大阪'))
        self.assertEqual(normalize_name('ＡＢＣ'),normalize_name('abc'))

    def test_non_latin_duplicate_names_remain_reviewable(self):
        rows=[{'id':str(i),'title':'東京','artist':'日本','album':'Demo','sha256':str(i)*64} for i in range(2)]
        self.assertEqual(len(scan_duplicates(rows)['groups']),1)

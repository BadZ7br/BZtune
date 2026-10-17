"""Unit tests for music discovery (without network / ytmusicapi / Flask)."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'doomvault-api/services/bztune_discovery.py'


def music(video_id, title, artist, album='Album'):
    return {'videoId': video_id, 'title': title,
            'artists': [{'name': artist}], 'album': {'name': album}, 'resultType': 'song'}


class FakeCatalog:
    def __init__(self):
        self.queries = []
    def search(self, term, filter, limit):
        self.queries.append((term, filter, limit))
        if filter == 'albums':
            return []
        if term == 'Electric Wizard Mother of Serpents':
            return [
                music('AAAAAAA0001', 'Mother of Serpents', 'Electric Wizard'),
                music('AAAAAAA0002', 'Mother of Serpents', 'Another Wizard'),
                music('AAAAAAA0003', 'Mother of Serpents', 'Electric Wizard'),
                music('AAAAAAA0004', 'Mother of Serpents (Official Video)', 'Electric Wizard'),
                music('AAAAAAA0005', 'Completely Other Song', 'Electric Wizard'),
            ]
        if term in ('Kyuss','Fu Manchu','Sleep','Truckfighters','Nebula','Colour Haze'):
            return [music('K'+str(len(term)).zfill(10), 'Track', term),
                    music('Z'+str(len(term)).zfill(10), 'Fake genre Song', 'Commercial Channel', 'Stoner Psychedelic Desert Music')]
        if term == 'Electric Wizard':
            return [music('VVVVVVV0001', 'Funeralopolis', 'Electric Wizard'),
                    music('VVVVVVV0002', 'The Electric Wizard', 'Random DJ')]
        return [music('GGGGGGG0001', 'Cumbia', 'A Cumbia Band')]


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('bztune_v1575_test_discovery', SOURCE)
        self.mod = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        sys.modules[spec.name] = self.mod
        spec.loader.exec_module(self.mod)
        self.catalog = FakeCatalog()
        self.mod._CLIENT = self.catalog
        self.mod._CACHE.clear()

    def test_alternatives_same_title_and_real_artist(self):
        result = self.mod.alternatives('Mother of Serpents', 'Electric Wizard', 'AAAAAAA0001')
        self.assertEqual([x['videoId'] for x in result['tracks']], ['AAAAAAA0003', 'AAAAAAA0004'])
        self.assertNotIn('AAAAAAA0001', [x['videoId'] for x in result['tracks']])
        self.assertTrue(all(x['artist'] == 'Electric Wizard' for x in result['tracks']))

    def test_alternatives_invalid_video_id(self):
        with self.assertRaises(ValueError):
            self.mod.alternatives('Mother of Serpents', 'Electric Wizard', '../danger')

    def test_alternatives_missing_fields(self):
        with self.assertRaises(ValueError):
            self.mod.alternatives('', 'Electric Wizard')

    def test_genre_verified_artist_not_keyword_spam(self):
        result = self.mod.explore('stoner', 'psicodelico')
        self.assertGreater(len(result['songs']), 0)
        self.assertTrue(all(x['artist'] in ('Kyuss','Fu Manchu','Sleep','Truckfighters','Nebula','Colour Haze') for x in result['songs']))
        self.assertIn('aproximado',result['note'])

    def test_freeform_genre_still_available(self):
        result = self.mod.explore('cumbia', 'energetico')
        self.assertEqual(result['songs'][0]['artist'],'A Cumbia Band')
        self.assertIn('aproximados',result['note'])

    def test_radio_refuses_title_only_match(self):
        result = self.mod.radio('Electric Wizard')
        self.assertEqual([x['videoId'] for x in result['tracks']],['VVVVVVV0001'])

    def test_embedded_restrictions_are_not_bypassed(self):
        # Recovery only suggests catalog IDs for manual selection; it never streams.
        frontend=(ROOT/'doomvault/src/player/OnlinePlaybackRecovery.tsx').read_text()
        self.assertIn('onChoose({ ...track, preferredSource: "online" })',frontend)
        self.assertIn('não as contorna',frontend)
        self.assertNotIn('yt-dlp',frontend)


if __name__=='__main__': unittest.main()

"""Real Flask routes retain provider identity rules after explicit registration."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'doomvault-api'))
import app as backend


class ArtistRouteRegistrationTests(unittest.TestCase):
    def test_search_retains_different_profiles_and_deduplicates_ids(self):
        rows=[{'browseId':'UC_first','artist':'Band'}, {'browseId':'UC_other','artist':'Band'},
              {'browseId':'UC_first','artist':'Band'}, None]
        with patch.object(backend.yt,'search',return_value=rows):
            response=backend.app.test_client().get('/api/artists?q=Band')
        self.assertEqual(response.status_code,200)
        self.assertEqual([p['id'] for p in response.json['results']],['UC_first','UC_other'])

    def test_discography_does_not_mix_same_name_profiles(self):
        chosen='UC'+'a'*22
        album={'browseId':'MPRE_chosen','title':'Record','year':'2000','artists':[{'name':'Band','id':chosen}]}
        other={**album,'browseId':'MPRE_other','artists':[{'name':'Band','id':'UC_other'}]}
        with patch.object(backend.yt,'get_artist',return_value={'name':'Band','albums':{'results':[album]}}), patch.object(backend.yt,'search',return_value=[album,other]):
            response=backend.app.test_client().get(f'/api/artists/{chosen}/albums?name=Band')
        self.assertEqual(response.status_code,200)
        self.assertEqual([a['id'] for a in response.json['albums']],['MPRE_chosen'])
        self.assertTrue(response.json['verified_id'])

    def test_empty_queries_reject_without_provider_calls(self):
        with patch.object(backend.yt,'search') as search:
            client=backend.app.test_client()
            self.assertEqual(client.get('/api/artists?q=').status_code,400)
            self.assertEqual(client.get('/api/artists/lookup/albums?name=').status_code,400)
            search.assert_not_called()

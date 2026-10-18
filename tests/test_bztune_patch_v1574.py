"""Regression v1.5.7.4; no network, no Flask or YouTube account required.
Run: python -m unittest discover -s tests -p 'test_bztune_patch_v1574.py' -v
"""
from __future__ import annotations
import ast
from contextlib import closing
import importlib.util
import pathlib
import re
import sqlite3
import sys
import tempfile
import types
import unicodedata
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]


def compile_functions(filepath, names, context):
    tree=ast.parse(filepath.read_text(encoding='utf8'))
    functions=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    assert len(functions)==len(names),f'Função ausente em {filepath}'
    code=compile(ast.fix_missing_locations(ast.Module(body=functions, type_ignores=[])),str(filepath),'exec')
    exec(code,context)
    return context


class SearchFixture:
    def __init__(self):
        self.song_results=[];self.album_results=[];self.related_results=[];self.watch=[];self.meta={}
        self.calls=[]

    def search(self,query,filter,limit):
        self.calls.append((query,filter,limit))
        return (self.song_results if filter=='songs' else self.album_results)[:limit]

    def get_artist(self,artist_id):
        return {'name':'Electric Wizard','related':{'results':self.related_results}}

    def get_watch_playlist(self,videoId,limit):
        return {'tracks':self.watch}

    def get_song(self,video_id):
        return self.meta.get(video_id, {})


def song(ident,title,artist,album='Dopethrone',resultType='song'):
    return {'videoId':ident,'title':title,'artists':[{'name':artist}],
            'album':{'name':album},'resultType':resultType,
            'thumbnails':[{'url':'https://lh3.googleusercontent.com/image'}]}


class DiscoveryPatchTests(unittest.TestCase):
    def setUp(self):
        name='bztune_patch_discovery'
        path=ROOT/'doomvault-api/services/bztune_discovery.py'
        spec=importlib.util.spec_from_file_location(name,path)
        self.discovery=importlib.util.module_from_spec(spec);sys.modules[name]=self.discovery
        spec.loader.exec_module(self.discovery)
        self.yt=SearchFixture();self.discovery._CLIENT=self.yt

    def test_radio_excludes_homonym_tracks_and_titles(self):
        self.yt.song_results=[song('12345678901','Wizard Fight','Electric Wizard'),
            song('12345678902','Electric Wizard','Not Electric Wizard'),
            song('12345678903','The Electric Wizard','Wizard Master')]
        data=self.discovery.radio('Electric Wizard')
        self.assertEqual([s['videoId'] for s in data['tracks']],['12345678901'])

    def test_radio_related_only_when_id_selected(self):
        self.yt.song_results=[song('12345678901','Funeralopolis','Electric Wizard')]
        self.yt.related_results=[{'browseId':'UC_TEST_BAND_01','title':'Electric Wizard'},
                                {'browseId':'UC_TEST_BAND_02','title':'Other Band'}]
        result=self.discovery.radio('Electric Wizard','UC_ELECTRIC_WIZARD_001')
        self.assertEqual(len(result['tracks']),1)
        self.assertFalse(result['tracks'][0].get('recommended'))

    def test_related_artists_kept_separate_by_id(self):
        self.yt.related_results=[{'browseId':'UC_TWO_BAND_A','title':'Witch'},
                                 {'browseId':'UC_TWO_BAND_B','title':'Witch'}]
        result=self.discovery.artist_neighbors('UC_ELECTRIC_WIZARD_001','Electric Wizard')
        self.assertEqual(len(result['artists']),2)
        self.assertNotEqual(result['artists'][0]['id'],result['artists'][1]['id'])

    def test_invalid_video_ids_never_enter_queue(self):
        self.yt.song_results=[song('invalid','Track','Electric Wizard'),song('12345678901','Track 2','Electric Wizard')]
        self.assertEqual(len(self.discovery.radio('Electric Wizard')['tracks']),1)

    def test_seo_compilation_removed(self):
        self.yt.song_results=[song('12345678901','Valid title','The Black Angels','Phosphene Dream'),
            song('12345678902','Psychedelic','Ad Radio','Psychedelic Stoner Desert Rock Rap Chill Beats Music')]
        result=self.discovery.explore('stoner','psicodelico')
        self.assertEqual([x['videoId'] for x in result['songs']],['12345678901'])

    def test_artist_fallback_normalizes_diacritics(self):
        self.assertTrue(self.discovery._same_artist({'artist':'Böngzilla'},'Bongzilla'))


class CatalogIdentityTests(unittest.TestCase):
    def setUp(self):
        self.yt=SearchFixture()
        def yt_creator():return self.yt
        def album_for_track(*args):return None
        def release(*args):return {'tracks':[]}
        def artist_id(row,artist):
            return any(normalized(x['name'])==normalized(artist) for x in row.get('artists',[]))
        def normalized(text):
            return ' '.join(''.join(c for c in unicodedata.normalize('NFKD',str(text).lower()) if not unicodedata.combining(c)).split())
        path=ROOT/'doomvault-api/api/auto_catalog_api.py'
        self.ns=compile_functions(path,{'normalized','artist_match','_metadata_matches_song','resolve'},
            {'unicodedata':unicodedata,'re':re,'YTMusic':yt_creator,
             'verified_release':release,'album_for_track':album_for_track,
             'VIDEO_ID':re.compile(r'[\w-]{11}')})

    def call(self,ident='abcdefghijk'):
        return self.ns['resolve']('Black Sabbath','Solitude','track',video_id=ident)

    def test_exact_search_still_works(self):
        self.yt.song_results=[song('abcdefghijk','Solitude','Black Sabbath')]
        tracks,album=self.call()
        self.assertEqual(tracks[0]['videoId'],'abcdefghijk')

    def test_valid_id_can_be_verified_via_metadata(self):
        self.yt.song_results=[]
        self.yt.meta['abcdefghijk']={'videoDetails':{'videoId':'abcdefghijk','title':'Solitude','author':'Black Sabbath - Topic'}}
        tracks,_=self.call()
        self.assertEqual(tracks[0]['title'],'Solitude')

    def test_wrong_artist_never_downloaded(self):
        self.yt.meta['abcdefghijk']={'videoDetails':{'videoId':'abcdefghijk','title':'Solitude','author':'Another band'}}
        with self.assertRaisesRegex(ValueError,'Nenhum download'):
            self.call()

    def test_wrong_video_id_never_downloaded(self):
        self.yt.meta['abcdefghijk']={'videoDetails':{'videoId':'zyxwvutsrqp','title':'Solitude','author':'Black Sabbath'}}
        with self.assertRaises(ValueError):self.call()

    def test_age_restriction_not_bypassed(self):
        self.yt.meta['abcdefghijk']={'playabilityStatus':{'status':'AGE_VERIFICATION_REQUIRED'},
                                    'videoDetails':{'videoId':'abcdefghijk','title':'Solitude','author':'Black Sabbath'}}
        with self.assertRaises(ValueError):self.call()

    def test_restricted_even_when_search_metadata_matches(self):
        self.yt.song_results=[song('abcdefghijk','Solitude','Black Sabbath')]
        self.yt.meta['abcdefghijk']={'playabilityStatus':{'status':'AGE_VERIFICATION_REQUIRED'},
                                    'videoDetails':{'videoId':'abcdefghijk','title':'Solitude','author':'Black Sabbath'}}
        with self.assertRaisesRegex(ValueError,'restrição'):
            self.call()

    def test_no_blind_fuzzy_matching(self):
        self.yt.meta['abcdefghijk']={'videoDetails':{'videoId':'abcdefghijk','title':'Another Solitude','author':'Black Sabbath'}}
        with self.assertRaises(ValueError):self.call()

    def test_reject_bad_id_early(self):
        with self.assertRaises(ValueError):self.call(ident='invalid')


if __name__=='__main__':unittest.main()

"""Regression tests for BZtune 1.5-1.7 (stdlib only)."""
import importlib.util
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import types
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]

def load(name, path):
    spec=importlib.util.spec_from_file_location(name, path)
    module=importlib.util.module_from_spec(spec)
    sys.modules[name]=module
    spec.loader.exec_module(module)
    return module

class BZtuneFeatureTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.library=self.root/'doomvault-api/doomvault_library'
        (self.library/'audio').mkdir(parents=True)
        (self.root/'doomvault').mkdir()
        (self.root/'doomvault/package.json').write_text('{}')
        (self.root/'doomvault-api/app.py').write_text('#fixture')
        self.db=self.library/'library.sqlite3'
        with closing(sqlite3.connect(self.db)) as db:
            db.execute('CREATE TABLE tracks(id TEXT PRIMARY KEY,title TEXT,artist TEXT)')
            db.execute('CREATE TABLE track_sources(source_id TEXT PRIMARY KEY, track_id TEXT)')
            db.execute("INSERT INTO tracks VALUES ('local123456789','Solitude','Black Sabbath')")
            db.execute("INSERT INTO track_sources VALUES ('youtube1234','local123456789')")
            db.commit()
        api=types.ModuleType('api');api.__path__=[]
        library=types.ModuleType('api.library_api')
        library.connection=self.connect;library.BASE=self.library;library.DB=self.db
        sys.modules['api']=api;sys.modules['api.library_api']=library
        self.stats=load('bztune_test_listening',ROOT/'doomvault-api/services/bztune_listening.py')
        self.backup=load('bztune_test_backup',ROOT/'doomvault-api/services/bztune_backup.py')
        self.backup.BASE=self.library;self.backup.DB=self.db
        self.restore=load('bztune_test_restore',ROOT/'scripts/restaurar_bztune.py')
        self.discovery=load('bztune_test_discovery',ROOT/'doomvault-api/services/bztune_discovery.py')

    def connect(self):
        db=sqlite3.connect(self.db);db.row_factory=sqlite3.Row;return db

    def record(self,seconds=32,session='session_abcdefghijkl'):
        return self.stats.save_progress(dict(sessionId=session,videoId='library:local123456789',
            title='Solitude',artist='Black Sabbath',album='Master of Reality',source='local',seconds=seconds))

    def test_listening_idempotent(self):
        self.record();self.record();self.record(44)
        info=self.stats.summary('all')
        self.assertEqual(info['totals']['plays'],1)
        self.assertEqual(info['totals']['seconds'],44)
        self.assertEqual(info['tracks'][0]['id'],'yt:youtube1234')
        self.assertEqual(info['albums'][0]['name'],'Master of Reality')
        self.assertEqual(self.stats.wrapped(2026)['year'],2026)

    def test_invalid_progress(self):
        with self.assertRaises(ValueError):
            self.stats.save_progress(dict(sessionId='bad',videoId='abcd',title='a',artist='b',seconds=90))
        self.assertEqual(self.stats.summary('all')['totals']['plays'],0)

    def test_roundtrip_backup_restore(self):
        music=self.library/'audio'/'sample.mp3';music.write_bytes(b'ID3-audio-test')
        self.record()
        archive,temp=self.backup.create_backup()
        info=self.backup.inspect_backup(archive)
        self.assertTrue(info['ok']);self.assertTrue(info['containsAudio'])
        self.assertFalse(self.restore.restore(archive,self.root,False)['willApply'])
        music.unlink()
        result=self.restore.restore(archive,self.root,True)
        self.assertTrue(result['restored']);self.assertTrue(music.exists())
        self.assertTrue(Path(result['backupAnterior']).exists())
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM bztune_listens').fetchone()[0],1)

    def test_archive_traversal_blocked(self):
        path=self.root/'malicious.zip'
        with zipfile.ZipFile(path,'w') as z:
            z.writestr('manifest.json',json.dumps({'format':'bztune-library-backup-v1','members':[]}))
            z.writestr('library.sqlite3',b'SQLite format 3\0')
            z.writestr('../evil.mp3',b'evil')
        with self.assertRaises(ValueError):self.backup.inspect_backup(path)
        with self.assertRaises(ValueError):self.restore.restore(path,self.root,True)

    def test_catalog_artists_remain_separate(self):
        class FakeYT:
            def get_artist(self,aid):return {'name':'Black Sabbath','related':{'results':[
                {'browseId':'UC_one_artist_1','title':'Artist X'},
                {'browseId':'UC_one_artist_2','title':'Artist X'}]}}
            def get_watch_playlist(self,videoId,limit):return {'tracks':[{'videoId':'abcdefghijk','title':'Song','artists':[{'name':'Black Sabbath'}]}]}
            def search(self,term,filter,limit):
                if filter=='songs':return [{'videoId':'abcdefghijk','title':'Song','artists':[{'name':'Black Sabbath'}]}]
                return [{'browseId':'MPREb_123456','title':'Album','artists':[{'name':'Black Sabbath'}]}]
        self.discovery._CLIENT=FakeYT()
        self.assertEqual(len(self.discovery.artist_neighbors('UC_black_sabbath','Black Sabbath')['artists']),2)
        self.assertTrue(self.discovery.radio('Black Sabbath',seed_video_id='abcdefghijk')['tracks'])
        self.assertTrue(self.discovery.recommendations(['Black Sabbath'])['albums'])
        self.assertTrue(self.discovery.explore('doom metal','sombrio')['songs'])

if __name__=='__main__':unittest.main()

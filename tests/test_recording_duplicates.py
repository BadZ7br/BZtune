import sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'doomvault-api'))
from api import library_api as library

class RecordingDuplicateTests(unittest.TestCase):
    def test_only_hash_or_source_id_proves_a_duplicate(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            with patch.multiple(library,BASE=root,FILES=root/'audio',COVERS=root/'covers',DB=root/'library.sqlite3'):
                db=library.connection()
                try:
                    db.execute('INSERT INTO tracks(id,title,artist,original_name,stored_name,mime,bytes,sha256) VALUES (?,?,?,?,?,?,?,?)',('first','Song','Artist','song.mp3','first.mp3','audio/mpeg',1,'a'*64))
                    library.remember_source(db,'abcdefghijk','first');db.commit()
                    self.assertIsNone(library.find_duplicate(db,'Song','Artist',sha256='b'*64))
                    self.assertIsNone(library.find_duplicate(db,'Song','Artist',source_id='lmnopqrstuv'))
                    self.assertIsNone(library.find_duplicate(db,'Song','Artist'))
                    self.assertEqual(library.find_duplicate(db,'Other','Other',sha256='a'*64)['id'],'first')
                    self.assertEqual(library.find_duplicate(db,'Other','Other',source_id='abcdefghijk')['id'],'first')
                finally:db.close()

import csv,io,sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'doomvault-api'))
from flask import Flask
from api import bztune_features as features

class CSVExportTests(unittest.TestCase):
    def test_spreadsheet_metadata_is_text_without_changing_stored_values(self):
        app=Flask(__name__);app.register_blueprint(features.features_bp)
        row={'started_at':'2026-10-27','artist':'@SUM(1,1)','title':' =1+1','album':'+1+1','source':'online','seconds':35}
        with patch.object(features.stats,'full_history',return_value=[row]):
            response=app.test_client().get('/api/bztune/stats/export.csv')
        self.assertEqual(response.status_code,200)
        exported=list(csv.reader(io.StringIO(response.data.decode())))[1]
        self.assertEqual(exported[1:4],["'@SUM(1,1)","' =1+1","'+1+1"])
        self.assertEqual(row['title'],' =1+1');self.assertEqual(exported[-1],'35')

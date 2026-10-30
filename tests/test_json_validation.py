import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'doomvault-api'))
from flask import Flask
from api import library_api,playlists_api,downloads_api,catalog_queue_api,auto_catalog_api,bztune_features,lyrics_api

class JSONValidationTests(unittest.TestCase):
    def test_mutations_reject_non_object_envelopes_before_accessing_fields(self):
        app=Flask(__name__)
        for bp in [library_api.library_bp,playlists_api.playlists_bp,downloads_api.downloads_bp,catalog_queue_api.catalog_queue_bp,auto_catalog_api.auto_catalog_bp,bztune_features.features_bp,lyrics_api.lyrics_bp]:app.register_blueprint(bp)
        client=app.test_client()
        for path in ['/api/playlists','/api/library/downloads','/api/library/downloads/ytdlp','/api/library/catalog/download','/api/library/catalog/queue','/api/library/auto-download','/api/library/albums/reconcile','/api/library/albums','/api/bztune/stats/progress']:
            for value in [['invalid'],'invalid',3,True,None]:
                with self.subTest(path=path,value=value):
                    r=client.post(path,data=__import__('json').dumps(value),content_type='application/json')
                    self.assertEqual(r.status_code,400);self.assertTrue(r.is_json)
        for value in [{'name':[]},{'name':42},{'title':{}},{'authorized':'false'}]:
            r=client.post('/api/playlists',json=value);self.assertEqual(r.status_code,400)

class DiagnosticRouteTests(unittest.TestCase):
    def test_diagnostic_route_restricts_targets_and_origins(self):
        from unittest.mock import patch
        app=Flask(__name__)
        app.register_blueprint(bztune_features.features_bp)
        client=app.test_client()
        with patch('services.self_diagnostics.network_check', return_value={'name':'LRCLIB','status':'ok','detail':'Contato HTTP.'}) as probe:
            self.assertEqual(client.get('/api/bztune/maintenance/checks/lrclib',headers={'Origin':'https://untrusted.example'}).status_code,403)
            self.assertEqual(client.get('/api/bztune/maintenance/checks/unknown').status_code,404)
            probe.assert_not_called()
            response=client.get('/api/bztune/maintenance/checks/lrclib')
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json['checks'][0]['status'],'ok')
            probe.assert_called_once_with('LRCLIB')

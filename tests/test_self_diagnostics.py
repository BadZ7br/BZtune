import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('self_diagnostics', Path(__file__).resolve().parents[1] / 'doomvault-api/services/self_diagnostics.py')
diag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)


class DiagnosticTests(unittest.TestCase):
    def test_network_closes_stream_and_never_reads_body(self):
        response = MagicMock()
        response.status_code = 200
        with patch.object(diag.requests, 'get') as get:
            get.return_value.__enter__.return_value = response
            result = diag.network_check('LRCLIB')
            self.assertEqual(result['status'], 'ok')
            self.assertTrue(get.call_args.kwargs['stream'])
            self.assertFalse(get.call_args.kwargs['allow_redirects'])
            get.return_value.__exit__.assert_called_once()
            self.assertEqual(response.method_calls, [])

    def test_network_failure_does_not_publish_exception(self):
        with patch.object(diag.requests, 'get', side_effect=diag.requests.Timeout('SECRET /home/private')):
            result = diag.network_check('LRCLIB')
        self.assertEqual(result['status'], 'failed')
        self.assertNotIn('SECRET', str(result))

    def test_redirect_is_not_success(self):
        response = MagicMock(status_code=302)
        with patch.object(diag.requests, 'get') as get:
            get.return_value.__enter__.return_value = response
            self.assertEqual(diag.network_check('Catálogo YouTube Music')['status'], 'warning')

    def test_unknown_network_target_rejected(self):
        with self.assertRaises(KeyError):
            diag.network_check('https://localhost/private')

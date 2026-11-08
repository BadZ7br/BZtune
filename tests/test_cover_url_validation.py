"""Malformed artwork references are rejected before any network request."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'doomvault-api'))
from app import app, trusted_cover_url


class CoverUrlValidationTests(unittest.TestCase):
    def test_malformed_urls_return_400_without_network(self):
        with app.test_client() as client, patch('app.requests.get') as network:
            for url in ('https://lh3.googleusercontent.com:invalid/a',
                        'https://lh3.googleusercontent.com:99999/a',
                        'https://[broken/a'):
                with self.subTest(url=url):
                    self.assertFalse(trusted_cover_url(url))
                    self.assertEqual(client.get('/api/cover', query_string={'url': url}).status_code, 400)
            network.assert_not_called()

    def test_valid_hosts_and_security_restrictions_are_preserved(self):
        for url in ('https://lh3.googleusercontent.com/a', 'https://a.mzstatic.com:443/a'):
            self.assertTrue(trusted_cover_url(url))
        for url in ('http://lh3.googleusercontent.com/a', 'https://user:pass@lh3.googleusercontent.com/a',
                    'https://lh3.googleusercontent.com:444/a', 'https://googleusercontent.com.attacker.test/a'):
            self.assertFalse(trusted_cover_url(url))

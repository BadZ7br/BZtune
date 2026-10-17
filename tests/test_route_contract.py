"""Verifica contratos HTTP, incluindo o editor de metadados v1.4.1."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERN = re.compile('(?m)^@([\\w]+)\\.(get|post|put|patch|delete|route)\\(["\']([^"\']+)')

class RouteContractTests(unittest.TestCase):
    def test_all_routes_unchanged(self):
        expected = json.loads((Path(__file__).parent / 'route_contract.json').read_text(encoding='utf-8'))
        backend=ROOT/'doomvault-api'
        files=[backend/'app.py',*sorted((backend/'api').glob('*.py'))]
        got = sorted([dict(owner=m[0],method=m[1],path=m[2]) for f in files for m in PATTERN.findall(f.read_text(encoding='utf-8'))],key=lambda x:(x['owner'],x['path'],x['method']))
        self.assertEqual(len(got),54)
        self.assertEqual(expected,got)

if __name__=='__main__':unittest.main()

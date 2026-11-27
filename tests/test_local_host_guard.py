"""Regressão: a API local só atende Host de loopback (evita DNS rebinding).

Roda a aplicação real em um processo separado, com biblioteca temporária.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PROBE = """
import sys
import backend_entry

client = backend_entry.create_desktop_app().test_client()
routes = ("/", "/api/library/tracks", "/api/playlists", "/api/bztune/backup/export")
failures = []
for host, expected in (
    ("127.0.0.1:5000", 200), ("localhost:5000", 200), ("LOCALHOST:5000", 200),
    ("127.0.0.1", 200), ("evil.example:5000", 403), ("evil.example", 403),
    ("localhost.evil.example:5000", 403), ("127.0.0.1.evil.example", 403),
    ("192.168.0.10:5000", 403),
):
    for route in routes:
        response = client.get(route, headers={"Host": host})
        if response.status_code != expected:
            failures.append(f"{host} {route}: {response.status_code}, esperado {expected}")
        response.close()
print("\\n".join(failures))
sys.exit(1 if failures else 0)
"""


class LocalHostGuardTests(unittest.TestCase):
    def test_only_loopback_hosts_reach_the_local_api(self):
        for desktop_mode in ("1", "0"):
            with self.subTest(desktop_mode=desktop_mode), tempfile.TemporaryDirectory() as folder:
                env = dict(
                    os.environ,
                    BZTUNE_DESKTOP_MODE=desktop_mode,
                    BZTUNE_LIBRARY_DIR=str(Path(folder) / "library"),
                    PYTHONPATH=os.pathsep.join((str(ROOT / "doomvault-api"), str(ROOT / "desktop"))),
                )
                result = subprocess.run(
                    [sys.executable, "-c", PROBE], env=env, capture_output=True,
                    text=True, timeout=60, check=False,
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr[-2000:])


if __name__ == "__main__":
    unittest.main()

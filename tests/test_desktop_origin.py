"""Regressão: Tauri precisa acessar as APIs v1.5–v1.7 sem liberar sites externos.

Testes independentes de Flask, rede e da biblioteca musical do usuário.
"""
from __future__ import annotations

import ast
import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "doomvault-api" / "services" / "bztune_origin.py"
FEATURES = ROOT / "doomvault-api" / "api" / "bztune_features.py"

spec = importlib.util.spec_from_file_location("bztune_origin_test_policy", POLICY)
assert spec is not None and spec.loader is not None
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


def load_feature_guard():
    """Carrega apenas o código real da função antes da requisição, isoladamente."""
    tree = ast.parse(FEATURES.read_text(encoding="utf-8"))
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "restrict_origin")
    node.decorator_list = []
    module = ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[]))
    request = SimpleNamespace(headers={})
    scope = {
        "os": os,
        "request": request,
        "jsonify": lambda value: value,
        "origin_permitted": policy.origin_permitted,
    }
    exec(compile(module, str(FEATURES), "exec"), scope)
    return scope["restrict_origin"], request


class BZtuneDesktopOriginTests(unittest.TestCase):
    def test_tauri_origins_only_allowed_in_desktop_mode(self):
        for origin in ("tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"):
            with self.subTest(origin=origin):
                self.assertTrue(policy.origin_permitted(origin, desktop_mode=True))
                self.assertFalse(policy.origin_permitted(origin, desktop_mode=False))

    def test_browser_development_origins_still_work(self):
        for origin in ("http://127.0.0.1:5173", "http://localhost:5173", "https://localhost:5173"):
            with self.subTest(origin=origin):
                self.assertTrue(policy.origin_permitted(origin, desktop_mode=True))
                self.assertTrue(policy.origin_permitted(origin, desktop_mode=False))

    def test_arbitrary_sites_cannot_access_private_library_routes(self):
        for origin in (
            "null", "file://", "https://evil.example", "https://localhost.evil.example",
            "http://attacker@localhost:5173", "http://tauri.localhost.attacker.example",
            "tauri://localhost.evil.example", "http://[invalid",
            "http://localhost:5173/private", "http://localhost:5173?query=1",
        ):
            with self.subTest(origin=origin):
                self.assertFalse(policy.origin_permitted(origin, desktop_mode=True))
                self.assertFalse(policy.origin_permitted(origin, desktop_mode=False))

    def test_existing_cli_access_without_origin_still_works(self):
        self.assertTrue(policy.origin_permitted("", desktop_mode=False))
        self.assertTrue(policy.origin_permitted("", desktop_mode=True))

    def test_actual_feature_guard_respects_desktop_only_origin(self):
        guard, request = load_feature_guard()
        request.headers["Origin"] = "http://tauri.localhost"
        with patch.dict(os.environ, {"BZTUNE_DESKTOP_MODE": "1"}):
            self.assertIsNone(guard())
        with patch.dict(os.environ, {"BZTUNE_DESKTOP_MODE": "0"}):
            self.assertEqual(guard(), ({"error": "Origem não autorizada"}, 403))

    def test_actual_feature_guard_blocks_external_sites_in_desktop(self):
        guard, request = load_feature_guard()
        request.headers["Origin"] = "https://evil.example"
        with patch.dict(os.environ, {"BZTUNE_DESKTOP_MODE": "1"}):
            self.assertEqual(guard(), ({"error": "Origem não autorizada"}, 403))


if __name__ == "__main__":
    unittest.main()

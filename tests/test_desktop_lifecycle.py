"""Testes isolados do ciclo de vida do Desktop e da comunicação com a WebView."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

from flask import Flask, jsonify
from flask_cors import CORS

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / "desktop" / "backend_entry.py"
RUST = ROOT / "desktop" / "src-tauri" / "src" / "main.rs"
MAIN = ROOT / "doomvault" / "src" / "main.tsx"


class DesktopLifecycleTests(unittest.TestCase):
    def test_backend_launch_and_process_tree_shutdown_are_registered(self):
        code = RUST.read_text(encoding="utf-8")
        self.assertIn(".set_process_group(true)", code)
        self.assertIn("if let Some(child) = guard.take() { let _ = child.kill(); }", code)
        self.assertIn("desktop_backend_ready", code)
        self.assertIn("verify_backend(&token)", code)
        self.assertIn('"/api/bztune/stats/summary?period=month"', code)
        self.assertIn('"/api/bztune/maintenance/diagnostics"', code)
        self.assertIn('"/api/library/tracks"', code)
        self.assertNotIn("taskkill /IM", code)
        self.assertNotIn("taskkill /F /IM", code)

    def test_frontend_waits_in_desktop_but_not_web(self):
        frontend = MAIN.read_text(encoding="utf-8")
        self.assertIn('native.invoke("desktop_backend_ready")', frontend)
        self.assertIn('if (!native?.invoke)', frontend)
        self.assertIn('mountApplication(); // Web e Vite continuam', frontend)
        self.assertIn("Verificar conexão novamente", frontend)

    def test_desktop_preflight_and_health_without_user_library(self):
        spec = importlib.util.spec_from_file_location("bztune_lifecycle_backend", ENTRY)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        flask_app = Flask("bztune_lifecycle_test")
        # Usa explicitamente PNA=False para provar que o hook Desktop é o último.
        CORS(flask_app, allow_private_network=False)

        @flask_app.get("/api/library/tracks")
        def tracks():
            return jsonify({"tracks": []})

        fake_app = types.ModuleType("app")
        fake_app.app = flask_app
        with (patch.dict(sys.modules, {"app": fake_app}),
              patch.object(module, "configure_library"),
              patch.dict(os.environ, {"BZTUNE_LAUNCH_TOKEN": "unit-test-token"})):
            desktop_app = module.create_desktop_app()

        client = desktop_app.test_client()
        self.assertEqual(client.get("/__desktop_health").status_code, 403)
        ok = client.get("/__desktop_health", headers={"X-BZtune-Launch": "unit-test-token"})
        self.assertEqual(ok.status_code, 200)

        allowed_origins = ("http://tauri.localhost", "https://tauri.localhost", "tauri://localhost")
        for origin in allowed_origins:
            with self.subTest(origin=origin):
                response = client.open(
                    "/api/library/tracks",
                    method="OPTIONS",
                    headers={
                        "Origin": origin,
                        "Access-Control-Request-Method": "GET",
                        "Access-Control-Request-Private-Network": "true",
                    },
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), origin)
                self.assertEqual(response.headers.get("Access-Control-Allow-Private-Network"), "true")

        forbidden = client.open(
            "/api/library/tracks",
            method="OPTIONS",
            headers={
                "Origin": "https://outside.example",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Private-Network": "true",
            },
        )
        self.assertEqual(forbidden.status_code, 403)
        self.assertNotEqual(forbidden.headers.get("Access-Control-Allow-Private-Network"), "true")


if __name__ == "__main__":
    unittest.main()

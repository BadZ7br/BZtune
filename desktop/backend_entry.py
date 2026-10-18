"""Entrada dedicada ao BZtune Desktop. Não modifica dados da versão web."""
from __future__ import annotations

import os
from pathlib import Path

def configure_library() -> Path:
    root = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
    base = Path(os.environ.get("BZTUNE_LIBRARY_DIR") or (root / "BZtune" / "library")).expanduser().resolve()
    base.mkdir(parents=True, exist_ok=True)
    from api import library_api
    library_api.BASE = base
    library_api.FILES = base / "audio"
    library_api.COVERS = base / "covers"
    library_api.DB = base / "library.sqlite3"
    return base

def create_desktop_app():
    configure_library()
    from app import app
    from flask import abort, jsonify, request
    token = os.environ.get("BZTUNE_LAUNCH_TOKEN", "")
    origins = {"tauri://localhost", "http://tauri.localhost", "https://tauri.localhost",
               "http://127.0.0.1:5173", "http://localhost:5173"}

    @app.before_request
    def desktop_origin_guard():
        origin = request.headers.get("Origin")
        if origin and origin not in origins:
            abort(403)

    @app.after_request
    def desktop_local_network_preflight(response):
        # Responde ao preflight PNA somente para as origens permitidas no Desktop.
        # Não concede acesso a páginas arbitrárias da internet.
        origin = request.headers.get("Origin", "")
        if (request.method == "OPTIONS" and origin in origins
                and request.headers.get("Access-Control-Request-Private-Network", "").lower() == "true"):
            response.headers["Access-Control-Allow-Private-Network"] = "true"
            response.vary.add("Origin")
        return response

    # Flask executa after_request em ordem reversa. Executar este hook
    # após o Flask-CORS para manter o preflight PNA estritamente autorizado.
    app.after_request_funcs[None].remove(desktop_local_network_preflight)
    app.after_request_funcs[None].insert(0, desktop_local_network_preflight)

    @app.get("/__desktop_health")
    def desktop_health():
        # O token é fornecido pela aplicação nativa e nunca é gravado no disco.
        if not token or request.headers.get("X-BZtune-Launch") != token:
            abort(403)
        return jsonify({"status": "ok", "desktop": True})

    return app

def main():
    if os.environ.get("BZTUNE_DESKTOP_MODE") != "1":
        raise SystemExit("Este executável somente pode ser iniciado pelo BZtune Desktop.")
    from waitress import serve
    serve(create_desktop_app(), host="127.0.0.1", port=5000, threads=8)

if __name__ == "__main__":
    main()

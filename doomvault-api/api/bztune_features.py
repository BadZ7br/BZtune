"""BZtune v1.5/1.6/1.7, endpoints aditivos.

Importante: o backend deve continuar restrito a 127.0.0.1.
"""
from __future__ import annotations

import csv
import io
import json
import platform
import shutil
import zipfile
import sqlite3
import sys
from datetime import datetime
from flask import Blueprint, abort, jsonify, make_response, request, send_file
from api.library_api import DB, BASE
from services import bztune_listening as stats
from services import bztune_discovery as discover
from services import bztune_backup as backup

features_bp=Blueprint("bztune_features",__name__)


@features_bp.before_request
def restrict_origin():
    # Não expõe backups a páginas de outros sites. CLI local sem Origin é aceito.
    origin=request.headers.get("Origin","")
    if origin:
        from urllib.parse import urlparse
        parsed=urlparse(origin)
        if parsed.scheme not in ("http","https") or parsed.hostname not in ("127.0.0.1","localhost"):
            return jsonify({"error":"Origem não autorizada"}),403


def failure(exc: Exception, status=400):
    return jsonify({"error":str(exc)[:240]}),status


@features_bp.get("/api/bztune/discovery/recommendations")
def recommendations():
    artists=request.args.getlist("artist")[:4]
    if not artists:
        info=stats.summary("month")
        artists=[r["name"] for r in info["artists"][:3]]
    try: return jsonify(discover.recommendations(artists))
    except Exception:
        return jsonify({"error":"Catálogo temporariamente indisponível. Tente novamente."}),503


@features_bp.get("/api/bztune/discovery/related")
def related_artists():
    try: return jsonify(discover.artist_neighbors(request.args.get("id", ""),request.args.get("name", "")))
    except ValueError as exc:return failure(exc)
    except Exception:return failure(ValueError("Não foi possível consultar artistas relacionados."),503)


@features_bp.get("/api/bztune/discovery/radio")
def artist_radio():
    try: return jsonify(discover.radio(request.args.get("artist", ""),request.args.get("id", ""),request.args.get("videoId", "")))
    except ValueError as exc:return failure(exc)
    except Exception:return failure(ValueError("Não foi possível criar a rádio."),503)


@features_bp.get("/api/bztune/discovery/alternatives")
def alternative_recordings():
    try:
        return jsonify(discover.alternatives(request.args.get("title", ""),
                                           request.args.get("artist", ""),
                                           request.args.get("exclude", "")))
    except ValueError as exc:
        return failure(exc)
    except Exception:
        return failure(ValueError("Não foi possível consultar outras gravações."), 503)


@features_bp.get("/api/bztune/discovery/explore")
def explore():
    try:return jsonify(discover.explore(request.args.get("genre", ""),request.args.get("mood", "")))
    except ValueError as exc:return failure(exc)
    except Exception:return failure(ValueError("Catálogo temporariamente indisponível."),503)


@features_bp.post("/api/bztune/stats/progress")
def record_progress():
    data=request.get_json(silent=True)
    if not isinstance(data,dict):return jsonify({"error":"Corpo JSON obrigatório"}),400
    try:return jsonify(stats.save_progress(data))
    except ValueError as exc:return failure(exc)


@features_bp.get("/api/bztune/stats/summary")
def stats_summary():
    period=request.args.get("period","all")
    if period not in ("week","month","year","all"):
        return jsonify({"error":"Período inválido"}),400
    return jsonify(stats.summary(period))


@features_bp.get("/api/bztune/stats/wrapped")
def stats_wrapped():
    try:return jsonify(stats.wrapped(int(request.args.get("year",datetime.now().year)),int(request.args.get("month",0))))
    except (ValueError,TypeError) as exc:return failure(exc)


@features_bp.get("/api/bztune/stats/export.csv")
def stats_csv():
    data=stats.full_history()
    out=io.StringIO(newline="")
    writer=csv.writer(out)
    writer.writerow(["Data","Artista","Musica","Album","Fonte","Segundos"])
    for row in data:
        writer.writerow([row["started_at"],row["artist"],row["title"],row["album"],row["source"],row["seconds"]])
    response=make_response(out.getvalue())
    response.headers["Content-Type"]="text/csv; charset=utf-8"
    response.headers["Content-Disposition"]="attachment; filename=BZtune-Historico.csv"
    return response


@features_bp.delete("/api/bztune/stats/history")
def clear_stats():
    if not request.is_json or request.get_json(silent=True,force=False)!={"confirm":"EXCLUIR HISTORICO"}:
        return jsonify({"error":"Confirmação explícita necessária"}),400
    return jsonify({"deleted":stats.clear_history()})


@features_bp.get("/api/bztune/maintenance/diagnostics")
def diagnostics():
    from importlib.util import find_spec
    from shutil import disk_usage
    packages={name:find_spec(name) is not None for name in ("flask","ytmusicapi","yt_dlp","mutagen","rapidfuzz","requests")}
    bins={name:shutil.which(name) for name in ("ffmpeg","ffprobe")}
    try:
        db=sqlite3.connect(DB)
        with db:
            db_ok=db.execute("PRAGMA quick_check").fetchone()[0]=="ok"
            count=db.execute("SELECT COUNT(*) FROM tracks").fetchone()[0]
        db.close()
        disk_free=disk_usage(BASE.parent).free
    except (OSError,sqlite3.DatabaseError):
        db_ok=False;count=0;disk_free=None
    return jsonify({"python":sys.version.split()[0],"platform":platform.platform(),
        "packages":packages,"ffmpeg":bins,"sqliteOK":db_ok,"tracks":count,
        "libraryPath":str(BASE),"freeBytes":disk_free,"backupFormat":backup.FORMAT})


@features_bp.get("/api/bztune/backup/export")
def export_backup():
    try:
        file,tmp=backup.create_backup()
    except (ValueError,OSError,sqlite3.Error) as exc:
        return failure(exc,500)
    response=send_file(file,as_attachment=True,download_name="BZtune-Backup.zip",mimetype="application/zip")
    response.call_on_close(lambda: shutil.rmtree(tmp,ignore_errors=True))
    return response


@features_bp.post("/api/bztune/backup/stage")
def upload_backup():
    file=request.files.get("file")
    if file is None:return failure(ValueError("Selecione um arquivo ZIP"))
    try:return jsonify(backup.stage_backup(file))
    except (ValueError,OSError,zipfile.BadZipFile) as exc: return failure(exc)

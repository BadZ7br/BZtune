"""Downloads autorizados para a biblioteca local do DoomVault.

Registre após library_bp:
    from downloads_api import downloads_bp
    app.register_blueprint(downloads_bp)

URLs HTTPS diretas MP3/FLAC, de domínios explicitamente permitidos.
Para adicionar um provedor controlado por você, configure a variável
DOOMVAULT_DOWNLOAD_HOSTS=archive.org,arquivos.seudominio.com
"""
from __future__ import annotations

import hashlib
import ipaddress
import json
import os
import socket
import sqlite3
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request

from library_api import FILES, EXTENSIONS, MAX_BYTES, connection, looks_like_audio, serialize, find_duplicate, extract_cover, lookup_cover, store_album_cover, _audio_metadata, _norm


downloads_bp = Blueprint("doomvault_downloads", __name__)
ALLOWED_HOSTS = {x.strip().lower() for x in os.environ.get(
    "DOOMVAULT_DOWNLOAD_HOSTS", "archive.org,files.freemusicarchive.org"
).split(",") if x.strip()}
JOBS: dict[str, dict] = {}
LOCK = threading.Lock()
MAX_CONCURRENT = 2
_DIRECT_IN_FLIGHT: set[str] = set()
_PERSISTED_PROGRESS: dict[str, int] = {}


def ensure_jobs_table(db):
    db.execute("""CREATE TABLE IF NOT EXISTS download_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")


def persist_job(job: dict):
    with connection() as db:
        ensure_jobs_table(db)
        db.execute("""INSERT INTO download_jobs(id,status,payload,updated_at)
            VALUES(?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET status=excluded.status,
            payload=excluded.payload,updated_at=CURRENT_TIMESTAMP""",
            (job["id"], job["status"], json.dumps(job, ensure_ascii=False)))


def restore_jobs():
    with LOCK:
        current_ids = set(JOBS)
    with connection() as db:
        ensure_jobs_table(db)
        rows = db.execute("SELECT payload FROM download_jobs ORDER BY updated_at DESC LIMIT 100").fetchall()
    restored = []
    for row in rows:
        try:
            job = json.loads(row["payload"])
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(job, dict) or not isinstance(job.get("id"), str):
            continue
        if job.get("status") in {"pending", "downloading"} and job["id"] not in current_ids:
            job.update(status="error", error="Download interrompido quando o aplicativo foi encerrado.")
            persist_job(job)
        restored.append(job)
    with LOCK:
        for job in reversed(restored):
            JOBS.setdefault(job["id"], job)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def validate_url(value: str) -> tuple[str, str]:
    parsed = urllib.parse.urlsplit(value)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError("É necessário um link HTTPS direto, sem credenciais ou porta personalizada.")
    if not host or host not in ALLOWED_HOSTS:
        raise ValueError("Domínio não autorizado. Configure DOOMVAULT_DOWNLOAD_HOSTS para fontes confiáveis.")
    try:
        ipaddress.ip_address(host)
        raise ValueError("Links com IP direto não são aceitos.")
    except ValueError as exc:
        if str(exc) == "Links com IP direto não são aceitos.":
            raise
    try:
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError("Não foi possível resolver o domínio.") from exc
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError("O endereço de destino não é público.")
    filename = Path(urllib.parse.unquote(parsed.path)).name
    ext = Path(filename).suffix.lower()
    if ext not in EXTENSIONS:
        raise ValueError("A URL precisa apontar diretamente para um arquivo .mp3 ou .flac.")
    return filename, ext


def update_job(job_id: str, **changes):
    snapshot = None
    with LOCK:
        if job_id in JOBS:
            job = JOBS[job_id]
            prior_status = job.get("status")
            job.update(changes)
            downloaded = job.get("downloaded", 0)
            should_persist = "downloaded" not in changes or job.get("status") != prior_status
            if not should_persist and downloaded - _PERSISTED_PROGRESS.get(job_id, 0) >= 1024 * 1024:
                should_persist = True
            if should_persist:
                _PERSISTED_PROGRESS[job_id] = downloaded
                snapshot = dict(job)
    if snapshot:
        persist_job(snapshot)


def run_download(job_id: str, url: str, filename: str, ext: str, title: str, artist: str):
    temporary: Path | None = None
    try:
        opener = urllib.request.build_opener(NoRedirect(), urllib.request.ProxyHandler({}))
        req = urllib.request.Request(url, headers={"User-Agent": "DoomVault/1.0", "Accept": "audio/*,application/octet-stream"})
        update_job(job_id, status="downloading")
        with opener.open(req, timeout=25) as response:
            content_type = response.headers.get("Content-Type", "").split(";")[0].lower().strip()
            if content_type in ("text/html", "application/json", "text/plain"):
                raise ValueError("O servidor não retornou um arquivo de áudio.")
            total = int(response.headers.get("Content-Length", "0") or "0")
            if total > MAX_BYTES:
                raise ValueError("Arquivo maior que 100 MiB.")
            update_job(job_id, total=total or None)
            FILES.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            size = 0
            first = b""
            with tempfile.NamedTemporaryFile(prefix="dl-", suffix=".part", dir=FILES, delete=False) as output:
                temporary = Path(output.name)
                while True:
                    block = response.read(64 * 1024)
                    if not block:
                        break
                    size += len(block)
                    if size > MAX_BYTES:
                        raise ValueError("Arquivo maior que 100 MiB.")
                    if not first:
                        first = block[:16]
                    output.write(block)
                    digest.update(block)
                    update_job(job_id, downloaded=size)
        if size == 0 or not looks_like_audio(first, ext):
            raise ValueError("O arquivo recebido não parece ser MP3/FLAC válido.")
        metadata = _audio_metadata(temporary.read_bytes())
        track_title = metadata["title"] if title == "Sem título" and metadata["title"] else title
        track_artist = metadata["artist"] if artist == "Artista desconhecido" and metadata["artist"] else artist
        album = str(metadata["album"] or "")
        genre = str(metadata["genre"] or "")
        year = metadata["year"]
        hexdigest = digest.hexdigest()
        with connection() as db:
            existing = find_duplicate(db, track_title, track_artist, sha256=hexdigest)
            if existing:
                update_job(job_id, status="complete", duplicate=True, track=serialize(existing))
                return
            track_id = uuid.uuid4().hex
            stored = track_id + ext
            destination = FILES / stored
            temporary.replace(destination)
            temporary = None
            try:
                db.execute("INSERT INTO tracks (id,title,artist,original_name,stored_name,mime,bytes,sha256,album,year,genre) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                           (track_id, track_title, track_artist, filename, stored, EXTENSIONS[ext], size, hexdigest, album, year, genre))
                db.commit()
            except sqlite3.IntegrityError:
                destination.unlink(missing_ok=True)
                row = db.execute("SELECT * FROM tracks WHERE sha256=?", (hexdigest,)).fetchone()
                update_job(job_id, status="complete", duplicate=True, track=serialize(row))
                return
            except Exception:
                destination.unlink(missing_ok=True)
                raise
            row = db.execute("SELECT * FROM tracks WHERE id=?", (track_id,)).fetchone()
        try:
            artwork = extract_cover(destination, track_id) or lookup_cover(track_artist, track_title, track_id, album)
            if artwork and album:
                store_album_cover(track_artist, album, artwork.read_bytes())
        except Exception:
            pass
        update_job(job_id, status="complete", track=serialize(row), downloaded=size, total=size)
    except urllib.error.HTTPError as exc:
        update_job(job_id, status="error", error=f"Servidor respondeu HTTP {exc.code}. Links com redirecionamento não são aceitos.")
    except Exception as exc:
        update_job(job_id, status="error", error=str(exc)[:250])
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)
        with LOCK:
            _DIRECT_IN_FLIGHT.discard(f"{_norm(artist)}::{_norm(title)}")


def enqueue_download(url: str, title: str, artist: str):
    filename, ext = validate_url(url)
    identity = f"{_norm(artist)}::{_norm(title)}"
    with connection() as db:
        existing = find_duplicate(db, title, artist)
    with LOCK:
        if existing:
            job_id = uuid.uuid4().hex
            job = {"id":job_id,"status":"complete","filename":filename,
                   "downloaded":0,"total":0,"duplicate":True,"error":None,"track":serialize(existing)}
            JOBS[job_id] = job
            snapshot = dict(job)
        else:
            if identity in _DIRECT_IN_FLIGHT:
                raise ValueError("Essa faixa já está sendo baixada.")
            active = sum(job["status"] in {"pending", "downloading"} for job in JOBS.values())
            if active >= MAX_CONCURRENT:
                raise RuntimeError("Limite de 2 downloads simultâneos. Aguarde os atuais.")
            job_id = uuid.uuid4().hex
            JOBS[job_id] = {"id": job_id, "status": "pending", "filename": filename,
                            "downloaded": 0, "total": None, "duplicate": False,
                            "error": None, "track": None}
            snapshot = dict(JOBS[job_id])
            _DIRECT_IN_FLIGHT.add(identity)
    persist_job(snapshot)
    if existing:
        return dict(snapshot)
    threading.Thread(target=run_download,
        args=(job_id, url, filename, ext, title, artist), daemon=True).start()
    return snapshot


@downloads_bp.post("/api/library/downloads")
def create_download():
    payload = request.get_json(silent=True) or {}
    url = str(payload.get("url") or "").strip()
    if len(url) > 2048 or not payload.get("authorized"):
        return jsonify({"error": "Informe um link válido e confirme a autorização."}), 400
    try:
        job = enqueue_download(url, str(payload.get("title") or "Sem título")[:200],
                               str(payload.get("artist") or "Artista desconhecido")[:200])
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 429
    return jsonify({"job": job}), 202


@downloads_bp.get("/api/library/downloads")
def list_downloads():
    restore_jobs()
    with LOCK:
        jobs = list(reversed(list(JOBS.values())))[:30]
    return jsonify({"jobs": jobs})


# Fontes opt-in: este arquivo é preenchido exclusivamente pelo responsável
# pelo catálogo com URLs de arquivos cuja distribuição esteja autorizada.
# O backend NUNCA gera URLs de áudio a partir de IDs do YouTube Music.
import unicodedata

SOURCES_FILE = Path(__file__).resolve().parent / "doomvault_download_sources.json"

def normalized(value):
    return " ".join("".join(c for c in unicodedata.normalize("NFKD", value.lower())
                            if not unicodedata.combining(c)).split())

def available_sources():
    if not SOURCES_FILE.exists():
        return []
    try:
        items = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
        if not isinstance(items, list):
            return []
        return [item for item in items if isinstance(item, dict)
                and all(isinstance(item.get(field), str) and item[field].strip()
                        for field in ("artist", "title", "url"))
                and isinstance(item.get("authorized"), bool) and item["authorized"]]
    except (OSError, ValueError):
        return []

def match_sources(artist: str, title: str, kind: str):
    candidates = [x for x in available_sources() if normalized(x["artist"]) == normalized(artist)]
    if kind == "release":
        return [x for x in candidates if normalized(x.get("album", "")) == normalized(title)]
    return [x for x in candidates if normalized(x["title"]) == normalized(title)]

@downloads_bp.get("/api/library/catalog/availability")
def catalog_availability():
    artist = str(request.args.get("artist", ""))[:200]
    title = str(request.args.get("title", ""))[:200]
    kind = request.args.get("kind", "track")
    if kind not in ("track", "release") or not artist or not title:
        return jsonify({"error": "Informe artista, título e tipo."}), 400
    matches = match_sources(artist, title, kind)
    return jsonify({"available": bool(matches), "count": len(matches)})

@downloads_bp.post("/api/library/catalog/download")
def catalog_download():
    payload = request.get_json(silent=True) or {}
    artist = str(payload.get("artist", ""))[:200]
    title = str(payload.get("title", ""))[:200]
    kind = payload.get("kind", "track")
    if kind not in ("track", "release") or not artist or not title:
        return jsonify({"error": "Artista ou título inválido."}), 400
    matches = match_sources(artist, title, kind)
    if not matches:
        return jsonify({"error": "Nenhum arquivo autorizado cadastrado para este lançamento."}), 404
    queued, errors = [], []
    for item in matches:
        try:
            if item.get("engine") == "yt-dlp":
                from ytdlp_worker import enqueue_ytdlp
                job = enqueue_ytdlp(item["url"], item["title"][:200], item["artist"][:200], JOBS, LOCK, MAX_CONCURRENT)
            else:
                job = enqueue_download(item["url"], item["title"][:200], item["artist"][:200])
            queued.append(job["id"])
        except (ValueError, RuntimeError) as exc:
            errors.append(str(exc))
    return jsonify({"jobs": queued, "errors": errors, "total": len(matches)}), (202 if queued else 429)


@downloads_bp.post("/api/library/downloads/ytdlp")
def create_ytdlp_download():
    payload = request.get_json(silent=True) or {}
    if payload.get("authorized") is not True:
        return jsonify({"error": "Confirme que tem permissão para baixar esta gravação."}), 400
    url = str(payload.get("url") or "")[:2048]
    if not url:
        return jsonify({"error": "Informe a URL da gravação."}), 400
    try:
        from ytdlp_worker import enqueue_ytdlp
        job = enqueue_ytdlp(url, str(payload.get("title") or "Sem título")[:200],
                            str(payload.get("artist") or "Artista desconhecido")[:200], JOBS, LOCK, MAX_CONCURRENT)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"job": job}), 202

"""Backend opcional para mídia que o usuário tem permissão de baixar.

yt-dlp baixa conteúdo publicamente disponível sem burlas de DRM;
FFmpeg converte para MP3 para a biblioteca HTML5 existente.
"""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import sqlite3
import tempfile
import threading
import urllib.parse
import uuid
from typing import Any
from pathlib import Path

from library_api import FILES, EXTENSIONS, MAX_BYTES, connection, looks_like_audio, serialize, find_duplicate, remember_source, extract_cover, lookup_cover, store_album_cover, _audio_metadata, _norm
from downloads_api import persist_job

_IN_FLIGHT: set[str] = set()

ALLOWED_YTDLP_HOSTS = {"youtube.com", "www.youtube.com", "music.youtube.com", "youtu.be", "archive.org", "www.archive.org"}


def validate_media_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError("Informe uma URL HTTPS válida para uma gravação autorizada.")
    if host not in ALLOWED_YTDLP_HOSTS:
        raise ValueError("Este domínio não está habilitado para yt-dlp.")
    if not parsed.path:
        raise ValueError("URL de mídia inválida.")
    return url


def enqueue_ytdlp(url: str, title: str, artist: str, jobs: dict, lock: threading.Lock, max_concurrent: int = 2):
    validate_media_url(url)
    try:
        import yt_dlp  # noqa: F401
    except ImportError as exc:
        raise ValueError("yt-dlp não instalado: execute python -m pip install yt-dlp") from exc
    if not shutil.which("ffmpeg"):
        raise ValueError("FFmpeg não encontrado no PATH do Windows.")
    parsed = urllib.parse.urlsplit(url)
    video_id = (urllib.parse.parse_qs(parsed.query).get("v") or [None])[0]
    if not video_id and parsed.hostname == "youtu.be":
        video_id = parsed.path.strip("/") or None
    if video_id and not re.fullmatch(r"[a-zA-Z0-9_-]{11}", video_id):
        video_id = None
    identity = f"{_norm(artist)}::{_norm(title)}"
    # Consulta o SQLite fora do LOCK de jobs para evitar inversão de locks
    # quando outra thread está concluindo e gravando um download.
    with connection() as db:
        existing = find_duplicate(db, title, artist, source_id=video_id)
    with lock:
        if existing:
            job_id = uuid.uuid4().hex
            result = {"id":job_id,"status":"complete","filename":title+".mp3",
                      "downloaded":0,"total":0,"duplicate":True,"error":None,"track":serialize(existing)}
            jobs[job_id] = result
            initial = dict(result)
            duplicate = True
        else:
            if identity in _IN_FLIGHT:
                raise ValueError("Essa faixa já está sendo baixada.")
            active = sum(j["status"] in {"pending", "downloading", "processing"} for j in jobs.values())
            if active >= max_concurrent:
                raise ValueError("Limite de dois downloads simultâneos; aguarde.")
            job_id = uuid.uuid4().hex
            jobs[job_id] = {"id": job_id, "status": "pending", "filename": title + ".mp3",
                            "downloaded": 0, "total": None, "duplicate": False, "error": None, "track": None}
            initial = dict(jobs[job_id])
            _IN_FLIGHT.add(identity)
            duplicate = False
    persist_job(initial)
    if duplicate:
        return initial

    persisted_progress = [0]
    def update(**values):
        snapshot = None
        with lock:
            jobs[job_id].update(values)
            job = jobs[job_id]
            previous = persisted_progress[0]
            downloaded = int(job.get("downloaded") or 0)
            if "downloaded" not in values or downloaded - previous >= 1024 * 1024:
                persisted_progress[0] = downloaded
                snapshot = dict(job)
        if snapshot:
            persist_job(snapshot)

    def worker():
        # Um diretório exclusivo impede colisão entre downloads concorrentes.
        FILES.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="doomvault-ytdlp-", dir=FILES) as tmp:
            root = Path(tmp)
            def progress(status):
                if status.get("status") == "downloading":
                    update(status="downloading", downloaded=int(status.get("downloaded_bytes") or 0),
                           total=status.get("total_bytes") or status.get("total_bytes_estimate"))
                elif status.get("status") == "finished":
                    update(status="processing")

            try:
                import yt_dlp
                options: Any = {
                    "format": "bestaudio/best",
                    "outtmpl": str(root / "%(id)s.%(ext)s"),
                    "noplaylist": True,
                    "ignoreerrors": False,
                    "quiet": True,
                    "no_warnings": True,
                    "retries": 2,
                    "fragment_retries": 2,
                    "socket_timeout": 20,
                    "max_filesize": MAX_BYTES,
                    "progress_hooks": [progress],
                    "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}],
                }
                with yt_dlp.YoutubeDL(options) as ydl:
                    metadata = ydl.extract_info(url, download=True)
                if not metadata:
                    raise ValueError("Não foi possível obter a gravação.")
                results = list(root.glob("*.mp3"))
                if len(results) != 1:
                    raise ValueError("Não foi gerado um MP3; confira o FFmpeg e a disponibilidade da faixa.")
                source = results[0]
                size = source.stat().st_size
                if size <= 0 or size > MAX_BYTES:
                    raise ValueError("Arquivo vazio ou acima de 100 MiB.")
                with source.open("rb") as f:
                    if not looks_like_audio(f.read(32), ".mp3"):
                        raise ValueError("Arquivo gerado não é um MP3 válido.")
                file_metadata = _audio_metadata(source.read_bytes())
                track_title = file_metadata["title"] if title == "Sem título" and file_metadata["title"] else title
                track_artist = file_metadata["artist"] if artist == "Artista desconhecido" and file_metadata["artist"] else artist
                album = str(file_metadata["album"] or "")
                genre = str(file_metadata["genre"] or "")
                year = file_metadata["year"]
                digest = hashlib.sha256()
                with source.open("rb") as f:
                    for block in iter(lambda: f.read(1024 * 1024), b""):
                        digest.update(block)
                with connection() as db:
                    existing = find_duplicate(db, track_title, track_artist, sha256=digest.hexdigest(), source_id=video_id)
                    if existing:
                        remember_source(db, video_id, existing["id"])
                        db.commit()
                        update(status="complete", duplicate=True, track=serialize(existing))
                        return
                    track_id = uuid.uuid4().hex
                    stored_name = track_id + ".mp3"
                    destination = FILES / stored_name
                    source.replace(destination)
                    try:
                        db.execute(
                            "INSERT INTO tracks (id,title,artist,original_name,stored_name,mime,bytes,sha256,album,year,genre) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                            (track_id, track_title, track_artist, f"{track_title}.mp3", stored_name, EXTENSIONS[".mp3"], size, digest.hexdigest(), album, year, genre),
                        )
                        remember_source(db, video_id, track_id)
                        db.commit()
                    except sqlite3.IntegrityError:
                        destination.unlink(missing_ok=True)
                        existing = find_duplicate(db, track_title, track_artist, sha256=digest.hexdigest(), source_id=video_id)
                        update(status="complete", duplicate=True, track=serialize(existing))
                        return
                    except Exception:
                        destination.unlink(missing_ok=True)
                        raise
                    row = db.execute("SELECT * FROM tracks WHERE id=?", (track_id,)).fetchone()
                # Salva a capa incorporada ou pesquisa arte do catálogo.
                try:
                    artwork = extract_cover(destination, track_id) or lookup_cover(track_artist, track_title, track_id, album)
                    if artwork and album:
                        store_album_cover(track_artist, album, artwork.read_bytes())
                except Exception:
                    pass  # Falha de capa nunca transforma o download válido em erro.
                update(status="complete", downloaded=size, total=size, track=serialize(row))
            except Exception as exc:
                update(status="error", error=str(exc)[:260])
            finally:
                with lock:
                    _IN_FLIGHT.discard(identity)

    threading.Thread(target=worker, daemon=True).start()
    return initial

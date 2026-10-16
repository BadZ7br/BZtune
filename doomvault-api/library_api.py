"""DoomVault: biblioteca local persistente.

Instale no mesmo diretório de app.py e registre com:
    from library_api import library_bp
    app.register_blueprint(library_bp)

O Flask precisa continuar ligado para reproduzir arquivos pelo navegador.
"""
from __future__ import annotations

import hashlib
import io
import json
import threading
import time
import re
import logging
import unicodedata
import urllib.parse
import urllib.request
import os
import sqlite3
import uuid
from pathlib import Path
from mutagen import File as MutagenFile
from mutagen.id3 import ID3
from flask import Blueprint, jsonify, request, send_file

library_bp = Blueprint("doomvault_library", __name__)
BASE = Path(__file__).resolve().parent / "doomvault_library"
FILES = BASE / "audio"
COVERS = BASE / "covers"
DB = BASE / "library.sqlite3"
MAX_BYTES = 100 * 1024 * 1024  # 100 MiB por arquivo
EXTENSIONS = {".mp3": "audio/mpeg", ".flac": "audio/flac"}
_COVER_FAILED: dict[str, float] = {}
_COVER_LOCK = threading.Lock()
_LOG = logging.getLogger("doomvault.covers")
_COVER_DIAGNOSTICS: dict[str, str] = {}


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def _image_extension(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def cover_filename(data: bytes, track_id: str):
    """Guarda somente JPG, PNG ou WebP pequenos, substituindo capas antigas."""
    if not data or len(data) > 4 * 1024 * 1024:
        return None
    suffix = _image_extension(data)
    if suffix is None:
        return None
    COVERS.mkdir(parents=True, exist_ok=True)
    path = COVERS / f"{track_id}{suffix}"
    temporary = COVERS / f"{track_id}.{uuid.uuid4().hex}.tmp"
    try:
        temporary.write_bytes(data)
        temporary.replace(path)
        for stale in (".jpg", ".png", ".webp"):
            other = COVERS / f"{track_id}{stale}"
            if other != path:
                other.unlink(missing_ok=True)
    finally:
        temporary.unlink(missing_ok=True)
    return path


def album_cover_id(artist: str, album: str) -> str | None:
    if not album.strip():
        return None
    identity = f"{_norm(artist)}|{_norm(album)}".encode("utf-8")
    return "album-" + hashlib.sha256(identity).hexdigest()


def album_cover_path(artist: str, album: str) -> Path | None:
    cover_id = album_cover_id(artist, album)
    if not cover_id:
        return None
    return next((COVERS / f"{cover_id}{suffix}" for suffix in (".jpg", ".png", ".webp")
                 if (COVERS / f"{cover_id}{suffix}").is_file()), None)


def store_album_cover(artist: str, album: str, content: bytes) -> Path | None:
    cover_id = album_cover_id(artist, album)
    return cover_filename(content, cover_id) if cover_id else None


def _norm(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).lower()
    return " ".join("".join(c if c.isalnum() else " " for c in text if not unicodedata.combining(c)).split())


def _base_title(title: str) -> str:
    """Remove somente qualificadores editoriais, mantendo versões ao vivo/acústicas distintas."""
    value = str(title or "")
    # (2009 Remaster), [Remastered 2012], - 2009 Remaster, etc.
    value = re.sub(r"[\(\[]\s*(?:(?:19|20)\d{2}\s*)?(?:re-?master(?:ed)?(?:\s+(?:version|edition))?|\d{4}\s+mix)\s*[\)\]]", "", value, flags=re.I)
    value = re.sub(r"\s*[-–—]\s*(?:(?:19|20)\d{2}\s*)?re-?master(?:ed)?(?:\s+(?:version|edition))?\s*$", "", value, flags=re.I)
    value = re.sub(r"\s*\((?:19|20)\d{2}\s+re-?master(?:ed)?\)\s*$", "", value, flags=re.I)
    return _norm(value)


def _same_title(requested: str, returned: str) -> bool:
    return bool(_base_title(requested)) and _base_title(requested) == _base_title(returned)


def _get_json(url: str, timeout: float = 6):
    req = urllib.request.Request(url, headers={"User-Agent": "DoomVault/1.2.1 (local-music-library)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def _trusted_image_url(url: str) -> bool:
    parts = urllib.parse.urlsplit(url)
    host = (parts.hostname or "").lower().rstrip(".")
    return (parts.scheme == "https" and not parts.username and not parts.password
            and parts.port in (None, 443) and bool(host)
            and (host.endswith(".mzstatic.com") or host == "mzstatic.com"
                 or host.endswith(".ytimg.com") or host == "ytimg.com"
                 or host.endswith(".googleusercontent.com") or host == "googleusercontent.com"))


class _TrustedRedirect(urllib.request.HTTPRedirectHandler):
    """Aceita redirecionamentos HTTPS exclusivamente entre servidores de capas conhecidos."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _trusted_image_url(newurl):
            raise ValueError("Redirecionamento para servidor de imagem não autorizado")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _download_cover(url: str, track_id: str):
    if not _trusted_image_url(url):
        return None
    opener = urllib.request.build_opener(_TrustedRedirect())
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 DoomVault/1.2.1", "Accept": "image/jpeg,image/png,image/webp,*/*;q=0.5"})
    with opener.open(req, timeout=7) as resp:
        if resp.status != 200:
            return None
        data = resp.read(4 * 1024 * 1024 + 1)
    return cover_filename(data, track_id)


def _artwork_candidates(artist: str, title: str, album: str = ""):
    """Produz imagens de catálogo com artista e título verificados, sem misturar homônimos."""
    seen: set[str] = set()
    urls: list[tuple[str, str]] = []
    notes: list[str] = []

    def add(url, source):
        if isinstance(url, str) and url and url not in seen and _trusted_image_url(url):
            seen.add(url)
            urls.append((url, source))

    # 1) iTunes costuma fornecer a capa do ÁLBUM, e não uma miniatura do videoclipe.
    for query in dict.fromkeys([f"{artist} {title}", f"{artist} {_base_title(title)}"]):
        try:
            q = urllib.parse.urlencode({"term": query, "entity": "song", "limit": 75, "country": "US"})
            data = _get_json("https://itunes.apple.com/search?" + q)
            for item in data.get("results", []):
                if _norm(item.get("artistName", "")) == _norm(artist) and _same_title(title, item.get("trackName", "")):
                    source = item.get("artworkUrl100")
                    if source:
                        add(source.replace("100x100bb", "600x600bb"), "iTunes: faixa correspondente")
            if urls:
                break
        except Exception as exc:
            notes.append("iTunes: " + type(exc).__name__)

    # 2) Quando o áudio carrega a tag ALBUM, a capa do disco é o melhor resultado.
    if album and _norm(album) not in {"unknown album", "album desconhecido"}:
        try:
            q = urllib.parse.urlencode({"term": f"{artist} {album}", "entity": "album", "limit": 35})
            data = _get_json("https://itunes.apple.com/search?" + q)
            for item in data.get("results", []):
                if _norm(item.get("artistName", "")) == _norm(artist) and _base_title(album) == _base_title(item.get("collectionName", "")):
                    source = item.get("artworkUrl100")
                    if source:
                        add(source.replace("100x100bb", "600x600bb"), "iTunes: álbum")
        except Exception as exc:
            notes.append("iTunes álbum: " + type(exc).__name__)

    return urls, notes


def _ytmusic_candidates(artist: str, title: str):
    seen: set[str] = set()
    urls: list[tuple[str, str]] = []
    notes: list[str] = []
    def add(url, source):
        if isinstance(url, str) and url and url not in seen and _trusted_image_url(url):
            seen.add(url)
            urls.append((url, source))
    # 3) YouTube Music: compara artistas + título, inclusive sem sufixo de remaster.
    try:
        from ytmusicapi import YTMusic
        yt = YTMusic()
        queries = list(dict.fromkeys([f"{artist} {title}", f"{artist} {_base_title(title)}"]))
        for query in queries:
            songs = yt.search(query, filter="songs", limit=30)
            for song in songs:
                if not _same_title(title, song.get("title", "")):
                    continue
                artists = song.get("artists") or []
                if not any(isinstance(a, dict) and _norm(a.get("name", "")) == _norm(artist) for a in artists):
                    continue
                thumbnails = song.get("thumbnails") or []
                for img in reversed(thumbnails):
                    if isinstance(img, dict):
                        add(img.get("url"), "YouTube Music: faixa correspondente")
                        break
    except Exception as exc:
        notes.append("YouTube Music: " + type(exc).__name__)

    return urls, notes


def _album_tag(audio_path: Path) -> str:
    try:
        file = MutagenFile(audio_path, easy=True)
        if file:
            values = file.get("album") or []
            return str(values[0]) if values else ""
    except Exception:
        pass
    return ""


def _audio_metadata(content: bytes) -> dict[str, str | int | None]:
    """Lê tags comuns de MP3/FLAC sem exigir que o arquivo já esteja salvo."""
    try:
        try:
            audio = MutagenFile(io.BytesIO(content), easy=True)
        except Exception:
            audio = None
        tags = audio.tags if audio else None
        id3_tags = ID3(io.BytesIO(content)) if content.startswith(b"ID3") else None
        id3_keys = {"title": "TIT2", "artist": "TPE1", "album": "TALB", "genre": "TCON"}

        def first_tag(key: str) -> str:
            values = tags.get(key, []) if tags else []
            if values:
                return str(values[0]).strip()
            frame = id3_tags.get(id3_keys.get(key, "")) if id3_tags and key in id3_keys else None
            return str(frame.text[0]).strip() if frame and getattr(frame, "text", None) else ""

        date = first_tag("date") or first_tag("year")
        if not date and id3_tags:
            date_frame = id3_tags.get("TDRC") or id3_tags.get("TYER")
            date = str(date_frame.text[0]) if date_frame and getattr(date_frame, "text", None) else ""
        year_match = re.search(r"(?:18|19|20|21)\d{2}", date)
        return {
            "title": first_tag("title"),
            "artist": first_tag("artist"),
            "album": first_tag("album"),
            "year": int(year_match.group()) if year_match else None,
            "genre": first_tag("genre"),
        }
    except Exception:
        return {"title": "", "artist": "", "album": "", "year": None, "genre": ""}


def lookup_cover(artist: str, title: str, track_id: str, album: str = ""):
    """A v1.2 e os serviços de download continuam podendo chamar com 3 parâmetros."""
    errors: list[str] = []
    notes: list[str] = []
    total_candidates = 0
    providers = (
        lambda: _artwork_candidates(artist, title, album),
        lambda: _ytmusic_candidates(artist, title),
    )
    for provider in providers:
        candidates, provider_notes = provider()
        notes.extend(provider_notes)
        for url, source in candidates:
            total_candidates += 1
            try:
                cover = _download_cover(url, track_id)
                if cover:
                    with _COVER_LOCK:
                        _COVER_DIAGNOSTICS[track_id] = "Capa encontrada: " + source
                    return cover
                errors.append(source + ": formato não suportado ou arquivo vazio")
            except Exception as exc:
                status = getattr(exc, "code", "")
                errors.append(source + ": " + type(exc).__name__ + (f" {status}" if status else ""))
    if not total_candidates:
        message = "Nenhuma imagem correspondente no catálogo. " + "; ".join(notes[:3])
    else:
        message = "Imagens encontradas, mas não puderam ser salvas. " + "; ".join(errors[:3] + notes[:1])
    with _COVER_LOCK:
        _COVER_DIAGNOSTICS[track_id] = message[:400]
    _LOG.warning("Falha ao buscar capa de %s — %s: %s", artist, title, message)
    return None


def extract_cover(audio_path: Path, track_id: str):
    """Extrai arte incorporada nos metadados do MP3 ou FLAC."""
    try:
        image_data = None
        if audio_path.suffix.lower() == ".mp3":
            tags = ID3(audio_path)
            for frame in tags.getall("APIC"):
                image_data = getattr(frame, "data", None)
                if image_data:
                    break
        elif audio_path.suffix.lower() == ".flac":
            audio = MutagenFile(audio_path)
            pictures = getattr(audio, "pictures", []) if audio else []
            if pictures:
                image_data = pictures[0].data
        return cover_filename(image_data, track_id) if image_data else None
    except Exception:
        return None


def connection():
    BASE.mkdir(exist_ok=True)
    FILES.mkdir(exist_ok=True)
    COVERS.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB, factory=ClosingConnection)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("""CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        mime TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL UNIQUE,
        album TEXT NOT NULL DEFAULT '',
        year INTEGER,
        genre TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    columns = {row["name"] for row in db.execute("PRAGMA table_info(tracks)")}
    for name, definition in (("album", "TEXT NOT NULL DEFAULT ''"), ("year", "INTEGER"), ("genre", "TEXT NOT NULL DEFAULT ''")):
        if name not in columns:
            db.execute(f"ALTER TABLE tracks ADD COLUMN {name} {definition}")
    db.execute("""CREATE TABLE IF NOT EXISTS track_sources (
        source_id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE
    )""")
    db.commit()
    return db


def serialize(row):
    has_cover = any((COVERS / f"{row['id']}{extension}").is_file() for extension in (".jpg", ".png", ".webp"))
    shared_cover = album_cover_path(row["artist"], row["album"])
    if shared_cover:
        cover_url = "/api/library/albums/cover?" + urllib.parse.urlencode({"artist": row["artist"], "album": row["album"]})
        has_cover = True
    else:
        cover_url = f"/api/library/tracks/{row['id']}/cover"
    return {
        "id": row["id"], "title": row["title"],
        "artist": row["artist"], "filename": row["original_name"],
        "album": row["album"], "year": row["year"], "genre": row["genre"],
        "hasCover": has_cover,
        "mime": row["mime"], "bytes": row["bytes"],
        "created_at": row["created_at"],
        "audioUrl": f"/api/library/tracks/{row['id']}/audio",
        "coverUrl": cover_url,
    }


def find_duplicate(db, title: str, artist: str, *, sha256: str | None = None,
                   source_id: str | None = None):
    """Não confunde faixas de artistas diferentes; compara ID, hash e metadados."""
    if source_id:
        row = db.execute("""SELECT tracks.* FROM tracks JOIN track_sources
            ON track_sources.track_id=tracks.id WHERE track_sources.source_id=?""", (source_id,)).fetchone()
        if row:
            return row
    if sha256:
        row = db.execute("SELECT * FROM tracks WHERE sha256=?", (sha256,)).fetchone()
        if row:
            return row
    key = (_norm(artist), _norm(title))
    # O banco antigo não tem colunas normalizadas; não alteramos o esquema tracks.
    for row in db.execute("SELECT * FROM tracks WHERE LENGTH(title) > 0"):
        if (_norm(row["artist"]), _norm(row["title"])) == key:
            return row
    return None


def remember_source(db, source_id: str | None, track_id: str):
    if source_id:
        db.execute("INSERT OR IGNORE INTO track_sources(source_id,track_id) VALUES (?,?)", (source_id, track_id))


def ensure_cover(track_id: str):
    """Extrai imagem incorporada ou baixa uma imagem de fonte de capa validada."""
    with connection() as db:
        row = db.execute("SELECT stored_name,title,artist,album FROM tracks WHERE id=?", (track_id,)).fetchone()
    if not row:
        return None
    shared = album_cover_path(row["artist"], row["album"])
    if shared:
        return shared
    for suffix in (".jpg", ".png", ".webp"):
        cover = COVERS / f"{track_id}{suffix}"
        if cover.is_file():
            return cover
    audio = FILES / row["stored_name"]
    if not audio.is_file():
        return None
    embedded = extract_cover(audio, track_id)
    if embedded and row["album"]:
        return store_album_cover(row["artist"], row["album"], embedded.read_bytes()) or embedded
    fetched = embedded or lookup_cover(row["artist"], row["title"], track_id, row["album"] or _album_tag(audio))
    if fetched and row["album"]:
        return store_album_cover(row["artist"], row["album"], fetched.read_bytes()) or fetched
    return fetched

def looks_like_audio(content: bytes, extension: str) -> bool:
    if extension == ".flac":
        return content.startswith(b"fLaC")
    if extension == ".mp3":
        if content.startswith(b"ID3"):
            return True
        # Cabeçalho de quadro MP3. Validar de modo básico, sem transcodificar.
        return len(content) >= 2 and content[0] == 0xFF and (content[1] & 0xE0) == 0xE0
    return False


@library_bp.get("/api/library/tracks")
def tracks():
    with connection() as db:
        rows = db.execute("SELECT * FROM tracks ORDER BY created_at DESC, title").fetchall()
    return jsonify({"tracks": [serialize(row) for row in rows], "count": len(rows)})


@library_bp.post("/api/library/import")
def import_track():
    incoming = request.files.get("file")
    if incoming is None or not incoming.filename:
        return jsonify({"error": "Selecione um arquivo MP3 ou FLAC."}), 400
    extension = Path(incoming.filename).suffix.lower()
    if extension not in EXTENSIONS:
        return jsonify({"error": "Somente .mp3 e .flac são aceitos."}), 415

    # Lê até o limite + 1 para recusar uploads grandes.
    content = incoming.stream.read(MAX_BYTES + 1)
    if not content or len(content) > MAX_BYTES:
        return jsonify({"error": "Arquivo vazio ou maior que 100 MiB."}), 413
    if not looks_like_audio(content, extension):
        return jsonify({"error": "O arquivo não parece ser um MP3/FLAC válido."}), 415

    digest = hashlib.sha256(content).hexdigest()
    metadata = _audio_metadata(content)
    title = (request.form.get("title") or metadata["title"] or Path(incoming.filename).stem).strip()[:200] or "Sem título"
    artist = (request.form.get("artist") or metadata["artist"] or "Artista desconhecido").strip()[:200] or "Artista desconhecido"
    album = (request.form.get("album") or metadata["album"] or "").strip()[:200]
    genre = (request.form.get("genre") or metadata["genre"] or "").strip()[:100]
    year = metadata["year"]
    try:
        form_year = int(request.form["year"])
        year = form_year if 1000 <= form_year <= 9999 else year
    except (KeyError, ValueError):
        pass
    track_id = uuid.uuid4().hex
    stored = track_id + extension

    with connection() as db:
        existing = find_duplicate(db, title, artist, sha256=digest)
        if existing:
            return jsonify({"track": serialize(existing), "duplicate": True}), 200
        destination = FILES / stored
        destination.write_bytes(content)
        try:
            db.execute(
                "INSERT INTO tracks (id,title,artist,original_name,stored_name,mime,bytes,sha256,album,year,genre) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (track_id, title, artist, Path(incoming.filename).name, stored, EXTENSIONS[extension], len(content), digest, album, year, genre),
            )
            db.commit()
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        row = db.execute("SELECT * FROM tracks WHERE id = ?", (track_id,)).fetchone()
    # Reaproveita a capa incorporada; as capas remotas também ficam em disco.
    # O carregamento da capa via GET tenta novamente quando a busca externa falhar.
    embedded = extract_cover(FILES / stored, track_id)
    if embedded and album:
        store_album_cover(artist, album, embedded.read_bytes())
    return jsonify({"track": serialize(row), "duplicate": False}), 201


@library_bp.patch("/api/library/tracks/<track_id>")
def update_track_metadata(track_id):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Envie os metadados em formato JSON."}), 400
    fields = {"title": 200, "artist": 200, "album": 200, "genre": 100}
    updates: dict[str, str | int | None] = {}
    for field, limit in fields.items():
        if field in payload:
            value = payload[field]
            if not isinstance(value, str) or (field in {"title", "artist"} and not value.strip()):
                return jsonify({"error": f"O campo {field} não pode ficar vazio."}), 400
            updates[field] = value.strip()[:limit]
    if "year" in payload:
        value = payload["year"]
        if value in (None, ""):
            updates["year"] = None
        elif isinstance(value, int) and not isinstance(value, bool) and 1000 <= value <= 9999:
            updates["year"] = value
        else:
            return jsonify({"error": "O ano deve estar entre 1000 e 9999."}), 400
    if not updates:
        return jsonify({"error": "Nenhum metadado foi informado."}), 400
    assignments = ", ".join(f"{field} = ?" for field in updates)
    with connection() as db:
        cursor = db.execute(f"UPDATE tracks SET {assignments} WHERE id = ?", (*updates.values(), track_id))
        if cursor.rowcount == 0:
            return jsonify({"error": "Faixa não encontrada."}), 404
        row = db.execute("SELECT * FROM tracks WHERE id = ?", (track_id,)).fetchone()
    return jsonify({"track": serialize(row)})


@library_bp.get("/api/library/tracks/<track_id>/audio")
def stream_track(track_id):
    with connection() as db:
        row = db.execute("SELECT * FROM tracks WHERE id = ?", (track_id,)).fetchone()
    if not row:
        return jsonify({"error": "Faixa não encontrada."}), 404
    path = FILES / row["stored_name"]
    if not path.is_file():
        return jsonify({"error": "Arquivo de áudio ausente."}), 404
    return send_file(path, mimetype=row["mime"], conditional=True)


@library_bp.delete("/api/library/tracks/<track_id>")
def delete_track(track_id):
    with connection() as db:
        row = db.execute("SELECT stored_name FROM tracks WHERE id = ?", (track_id,)).fetchone()
        if not row:
            return jsonify({"error": "Faixa não encontrada."}), 404
        db.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
        db.commit()
    (FILES / row["stored_name"]).unlink(missing_ok=True)
    for extension in (".jpg", ".png", ".webp"):
        (COVERS / f"{track_id}{extension}").unlink(missing_ok=True)
    with _COVER_LOCK:
        _COVER_FAILED.pop(track_id, None)
    return jsonify({"deleted": True})


@library_bp.get("/api/library/tracks/<track_id>/cover")
def track_cover(track_id):
    with connection() as db:
        row = db.execute(
            "SELECT stored_name, title, artist, album FROM tracks WHERE id = ?",
            (track_id,),
        ).fetchone()

    if not row:
        return jsonify({"error": "Faixa não encontrada."}), 404

    audio_path = FILES / row["stored_name"]

    if not audio_path.is_file():
        return jsonify({"error": "Áudio não encontrado."}), 404

    shared = album_cover_path(row["artist"], row["album"])
    if shared:
        return send_file(shared, conditional=True)

    for extension in (".jpg", ".png", ".webp"):
        cover_path = COVERS / f"{track_id}{extension}"

        if cover_path.is_file():
            return send_file(cover_path, conditional=True)

    embedded = extract_cover(audio_path, track_id)
    if embedded:
        if row["album"]:
            shared = store_album_cover(row["artist"], row["album"], embedded.read_bytes())
            if shared:
                return send_file(shared, conditional=True)
        return send_file(embedded, conditional=True)

    with _COVER_LOCK:
        last_fail = _COVER_FAILED.get(track_id, 0)
    if time.monotonic() - last_fail < 600:
        return jsonify({"error": "Capa ainda não disponível."}), 404

    fetched = lookup_cover(row["artist"], row["title"], track_id, row["album"] or _album_tag(audio_path))
    if fetched:
        if row["album"]:
            shared = store_album_cover(row["artist"], row["album"], fetched.read_bytes())
            if shared:
                return send_file(shared, conditional=True)
        return send_file(fetched, conditional=True)
    with _COVER_LOCK:
        _COVER_FAILED[track_id] = time.monotonic()
    return jsonify({"error": "Nenhuma capa correspondente encontrada."}), 404


@library_bp.get("/api/library/albums/cover")
def local_album_cover():
    artist = request.args.get("artist", "").strip()
    album = request.args.get("album", "").strip()
    cover = album_cover_path(artist, album)
    if not cover:
        return jsonify({"error": "Capa compartilhada do álbum não encontrada."}), 404
    return send_file(cover, conditional=True)


@library_bp.post("/api/library/albums/cover")
def upload_album_cover():
    artist = request.form.get("artist", "").strip()[:200]
    album = request.form.get("album", "").strip()[:200]
    if not artist or not album or not album_cover_id(artist, album):
        return jsonify({"error": "Informe o artista e o álbum para compartilhar a capa."}), 400
    upload = request.files.get("file")
    if not upload:
        return jsonify({"error": "Selecione uma imagem JPG, PNG ou WebP."}), 400
    content = upload.stream.read(4 * 1024 * 1024 + 1)
    if len(content) > 4 * 1024 * 1024:
        return jsonify({"error": "A capa precisa ter no máximo 4 MB."}), 413
    if not _image_extension(content):
        return jsonify({"error": "Imagem inválida: use JPG, PNG ou WebP."}), 415
    cover = store_album_cover(artist, album, content)
    if not cover:
        return jsonify({"error": "Não foi possível salvar a capa compartilhada."}), 400
    return jsonify({"saved": True, "coverUrl": "/api/library/albums/cover?" + urllib.parse.urlencode({"artist": artist, "album": album})}), 200



@library_bp.post("/api/library/tracks/<track_id>/refresh-cover")
def refresh_track_cover(track_id):
    with connection() as db:
        row = db.execute("SELECT id FROM tracks WHERE id=?", (track_id,)).fetchone()
    if row is None:
        return jsonify({"error":"Faixa não encontrada."}), 404
    with _COVER_LOCK:
        _COVER_FAILED.pop(track_id, None)
    artwork = ensure_cover(track_id)
    with _COVER_LOCK:
        detail = _COVER_DIAGNOSTICS.get(track_id, "")
        if artwork and not detail.startswith("Capa encontrada:") and not detail.startswith("Capa personalizada"):
            detail = "Capa incorporada ou imagem já salva."
        elif not detail:
            detail = "Nenhuma capa disponível."
    return jsonify({"coverUrl": f"/api/library/tracks/{track_id}/cover" if artwork else None,
                    "found": bool(artwork), "detail": detail})


@library_bp.post("/api/library/tracks/<track_id>/cover-upload")
def upload_track_cover(track_id):
    """Fallback manual quando catálogos públicos não têm arte correspondente."""
    with connection() as db:
        exists = db.execute("SELECT id FROM tracks WHERE id = ?", (track_id,)).fetchone()
    if not exists:
        return jsonify({"error": "Faixa não encontrada."}), 404
    artwork = request.files.get("file")
    if not artwork:
        return jsonify({"error": "Selecione uma imagem JPG, PNG ou WebP."}), 400
    data = artwork.stream.read(4 * 1024 * 1024 + 1)
    if not _image_extension(data):
        return jsonify({"error": "Imagem inválida: use JPG, PNG ou WebP."}), 415
    if len(data) > 4 * 1024 * 1024:
        return jsonify({"error": "A capa precisa ter no máximo 4 MB."}), 413
    stored = cover_filename(data, track_id)
    if not stored:
        return jsonify({"error": "Não foi possível salvar esta imagem."}), 400
    with _COVER_LOCK:
        _COVER_FAILED.pop(track_id, None)
        _COVER_DIAGNOSTICS[track_id] = "Capa personalizada enviada pelo usuário."
    return jsonify({"saved": True, "coverUrl": f"/api/library/tracks/{track_id}/cover"}), 200

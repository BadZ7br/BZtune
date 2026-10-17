"""DoomVault: biblioteca local persistente.

Instale no mesmo diretório de app.py e registre com:
    from api.library_api import library_bp
    app.register_blueprint(library_bp)

O Flask precisa continuar ligado para reproduzir arquivos pelo navegador.
"""
from __future__ import annotations

import hashlib
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
BASE = Path(__file__).resolve().parents[1] / "doomvault_library"
FILES = BASE / "audio"
COVERS = BASE / "covers"
DB = BASE / "library.sqlite3"
MAX_BYTES = 100 * 1024 * 1024  # 100 MiB por arquivo
EXTENSIONS = {".mp3": "audio/mpeg", ".flac": "audio/flac"}
_COVER_FAILED: dict[str, float] = {}
_COVER_LOCK = threading.Lock()
_LOG = logging.getLogger("doomvault.covers")
_COVER_DIAGNOSTICS: dict[str, str] = {}


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
    db = sqlite3.connect(DB)
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
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS track_sources (
        source_id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS local_albums (
        id TEXT PRIMARY KEY, artist TEXT NOT NULL, title TEXT NOT NULL,
        artist_key TEXT NOT NULL, title_key TEXT NOT NULL,
        UNIQUE(artist_key,title_key)
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS local_album_tracks (
        track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
        album_id TEXT NOT NULL REFERENCES local_albums(id) ON DELETE CASCADE,
        method TEXT NOT NULL DEFAULT 'manual'
    )""")
    db.execute("CREATE INDEX IF NOT EXISTS idx_local_album_tracks_album ON local_album_tracks(album_id)")
    # v1.4.1: campos extras separados, sem modificar a estrutura ou arquivos de áudio.
    db.execute("""CREATE TABLE IF NOT EXISTS track_metadata (
        track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
        release_year INTEGER,
        track_number INTEGER,
        album_manual INTEGER NOT NULL DEFAULT 0
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS track_metadata_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        old_title TEXT NOT NULL,
        old_artist TEXT NOT NULL,
        old_album_id TEXT,
        old_release_year INTEGER,
        old_track_number INTEGER,
        old_album_manual INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    db.execute("CREATE INDEX IF NOT EXISTS idx_track_metadata_history_track ON track_metadata_history(track_id,id)")
    db.execute("""CREATE TABLE IF NOT EXISTS local_album_title_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_id TEXT NOT NULL REFERENCES local_albums(id) ON DELETE CASCADE,
        old_title TEXT NOT NULL,
        old_title_key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    db.commit()
    return db


def serialize(row):
    return {
        "id": row["id"], "title": row["title"],
        "artist": row["artist"], "filename": row["original_name"],
        "mime": row["mime"], "bytes": row["bytes"],
        "created_at": row["created_at"],
        "audioUrl": f"/api/library/tracks/{row['id']}/audio",
        "coverUrl": f"/api/library/tracks/{row['id']}/cover",
        "year": row["release_year"] if "release_year" in row.keys() else None,
        "trackNumber": row["track_number"] if "track_number" in row.keys() else None,
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
        row = db.execute("SELECT stored_name,title,artist FROM tracks WHERE id=?", (track_id,)).fetchone()
    if not row:
        return None
    for suffix in (".jpg", ".png", ".webp"):
        cover = COVERS / f"{track_id}{suffix}"
        if cover.is_file():
            return cover
    audio = FILES / row["stored_name"]
    if not audio.is_file():
        return None
    return extract_cover(audio, track_id) or lookup_cover(row["artist"], row["title"], track_id, _album_tag(audio))

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
    # Identifica os álbuns contidos nos metadados sem fazer buscas na internet no GET.
    _group_from_audio_tags()
    with connection() as db:
        rows = db.execute("""SELECT t.*, a.id AS album_id, a.title AS album_title,
                m.release_year, m.track_number
            FROM tracks t LEFT JOIN local_album_tracks link ON t.id=link.track_id
            LEFT JOIN local_albums a ON a.id=link.album_id
            LEFT JOIN track_metadata m ON m.track_id=t.id
            ORDER BY t.created_at DESC, t.title""").fetchall()
    # BZTUNE_V144: expor IDs de origem existentes SEM alterar o esquema ou os registros.
    with connection() as db:
        source_rows = db.execute("SELECT source_id, track_id FROM track_sources").fetchall()
    source_by_track = {}
    for source in source_rows:
        source_by_track.setdefault(source["track_id"], []).append(source["source_id"])
    result = []
    for row in rows:
        item = serialize(row)
        item["albumId"] = row["album_id"]
        item["album"] = row["album_title"]
        item["sourceIds"] = source_by_track.get(row["id"], [])
        result.append(item)
    return jsonify({"tracks": result, "count": len(rows)})


def _track_metadata_row(db, track_id: str):
    return db.execute("""SELECT t.*, a.id AS album_id, a.title AS album_title,
        m.release_year, m.track_number, COALESCE(m.album_manual,0) AS album_manual
        FROM tracks t LEFT JOIN local_album_tracks link ON link.track_id=t.id
        LEFT JOIN local_albums a ON a.id=link.album_id
        LEFT JOIN track_metadata m ON m.track_id=t.id
        WHERE t.id=?""", (track_id,)).fetchone()


def _track_metadata_json(db, track_id: str):
    row = _track_metadata_row(db, track_id)
    if row is None:
        return None
    item = serialize(row)
    item["albumId"] = row["album_id"]
    item["album"] = row["album_title"]
    return item


def _optional_positive_number(data, field, minimum, maximum):
    value = data.get(field)
    if value is None or value == "":
        return None
    # Rejeita strings arbitrárias, números negativos e decimais.
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError(f"{field}: informe um número inteiro válido.")
    text = str(value).strip()
    if not text.isdigit():
        raise ValueError(f"{field}: informe um número inteiro válido.")
    number = int(text)
    if not minimum <= number <= maximum:
        raise ValueError(f"{field}: informe um valor de {minimum} a {maximum}.")
    return number


def _sync_local_playlist_titles(db, track_id, title, artist, album):
    """Mantém playlists mistas compatíveis; não altera entradas online."""
    exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='playlist_entries'").fetchone()
    if exists:
        db.execute("""UPDATE playlist_entries SET title=?, artist=?, album=?
            WHERE source='local' AND track_id=?""", (title, artist, album or "", track_id))


@library_bp.get("/api/library/tracks/<track_id>/metadata/history")
def track_metadata_history(track_id):
    with connection() as db:
        if not db.execute("SELECT 1 FROM tracks WHERE id=?", (track_id,)).fetchone():
            return jsonify({"error": "Faixa não encontrada."}), 404
        row = db.execute("""SELECT COUNT(*) AS n FROM track_metadata_history
            WHERE track_id=?""", (track_id,)).fetchone()
    return jsonify({"canUndo": row["n"] > 0, "changes": row["n"]})


@library_bp.patch("/api/library/tracks/<track_id>/metadata")
def update_track_metadata(track_id):
    data = request.get_json(silent=True)
    allowed = {"title", "artist", "album", "year", "trackNumber"}
    if not isinstance(data, dict) or not data or set(data) - allowed:
        return jsonify({"error": "Envie somente os campos: title, artist, album, year, trackNumber."}), 400
    try:
        with connection() as db:
            old = _track_metadata_row(db, track_id)
            if old is None:
                return jsonify({"error": "Faixa não encontrada."}), 404
            title = old["title"]
            artist = old["artist"]
            album = old["album_title"] or ""
            year = old["release_year"]
            number = old["track_number"]
            if "title" in data:
                if not isinstance(data["title"], str):
                    raise ValueError("Título inválido.")
                title = data["title"].strip()
                if not 1 <= len(title) <= 200:
                    raise ValueError("Título precisa ter de 1 a 200 caracteres.")
            if "artist" in data:
                if not isinstance(data["artist"], str):
                    raise ValueError("Artista inválido.")
                artist = data["artist"].strip()
                if not 1 <= len(artist) <= 200:
                    raise ValueError("Artista precisa ter de 1 a 200 caracteres.")
            if "album" in data:
                if data["album"] is not None and not isinstance(data["album"], str):
                    raise ValueError("Álbum inválido.")
                album = (data["album"] or "").strip()
                if len(album) > 220:
                    raise ValueError("Álbum deve ter até 220 caracteres.")
            if "year" in data:
                year = _optional_positive_number(data, "year", 1800, 2100)
            if "trackNumber" in data:
                number = _optional_positive_number(data, "trackNumber", 1, 999)
            album_changed = album != (old["album_title"] or "") or artist != old["artist"]
            changed = (title != old["title"] or artist != old["artist"] or album_changed
                       or year != old["release_year"] or number != old["track_number"])
            if not changed:
                return jsonify({"updated": False, "track": _track_metadata_json(db, track_id)})

            db.execute("""INSERT INTO track_metadata_history
                (track_id,old_title,old_artist,old_album_id,old_release_year,
                 old_track_number,old_album_manual)
                VALUES (?,?,?,?,?,?,?)""",
                (track_id,old["title"],old["artist"],old["album_id"],
                 old["release_year"],old["track_number"],old["album_manual"]))
            db.execute("UPDATE tracks SET title=?,artist=? WHERE id=?", (title,artist,track_id))
            if album_changed:
                if album:
                    new_album_id = _get_or_create_album(db, artist, album)
                    db.execute("""INSERT INTO local_album_tracks(track_id,album_id,method)
                        VALUES (?,?, 'metadata_editor') ON CONFLICT(track_id)
                        DO UPDATE SET album_id=excluded.album_id,method=excluded.method""",
                        (track_id,new_album_id))
                else:
                    db.execute("DELETE FROM local_album_tracks WHERE track_id=?", (track_id,))
            manual = 1 if album_changed else old["album_manual"]
            db.execute("""INSERT INTO track_metadata(track_id,release_year,track_number,album_manual)
                VALUES (?,?,?,?) ON CONFLICT(track_id) DO UPDATE SET
                release_year=excluded.release_year, track_number=excluded.track_number,
                album_manual=excluded.album_manual""", (track_id,year,number,manual))
            _sync_local_playlist_titles(db,track_id,title,artist,album)
            db.commit()
            item = _track_metadata_json(db, track_id)
        return jsonify({"updated": True, "track": item, "canUndo": True})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@library_bp.post("/api/library/tracks/<track_id>/metadata/undo")
def undo_track_metadata(track_id):
    with connection() as db:
        if not db.execute("SELECT 1 FROM tracks WHERE id=?", (track_id,)).fetchone():
            return jsonify({"error": "Faixa não encontrada."}), 404
        old = db.execute("""SELECT * FROM track_metadata_history
            WHERE track_id=? ORDER BY id DESC LIMIT 1""", (track_id,)).fetchone()
        if old is None:
            return jsonify({"error": "Não há edição anterior para desfazer."}), 409
        db.execute("UPDATE tracks SET title=?,artist=? WHERE id=?",
                   (old["old_title"],old["old_artist"],track_id))
        if old["old_album_id"]:
            db.execute("""INSERT INTO local_album_tracks(track_id,album_id,method)
                VALUES (?,?,'metadata_undo') ON CONFLICT(track_id) DO UPDATE SET
                album_id=excluded.album_id,method=excluded.method""", (track_id,old["old_album_id"]))
        else:
            db.execute("DELETE FROM local_album_tracks WHERE track_id=?", (track_id,))
        db.execute("""INSERT INTO track_metadata(track_id,release_year,track_number,album_manual)
            VALUES (?,?,?,?) ON CONFLICT(track_id) DO UPDATE SET
            release_year=excluded.release_year, track_number=excluded.track_number,
            album_manual=excluded.album_manual""",
            (track_id,old["old_release_year"],old["old_track_number"],old["old_album_manual"]))
        album_row = db.execute("""SELECT a.title FROM local_albums a JOIN local_album_tracks l
            ON a.id=l.album_id WHERE l.track_id=?""", (track_id,)).fetchone()
        _sync_local_playlist_titles(db,track_id,old["old_title"],old["old_artist"],
                                    album_row["title"] if album_row else "")
        db.execute("DELETE FROM track_metadata_history WHERE id=?", (old["id"],))
        db.commit()
        item = _track_metadata_json(db, track_id)
        remaining = db.execute("SELECT COUNT(*) FROM track_metadata_history WHERE track_id=?", (track_id,)).fetchone()[0]
    return jsonify({"restored": True, "track": item, "canUndo": remaining > 0})


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
    title = (request.form.get("title") or Path(incoming.filename).stem).strip()[:200] or "Sem título"
    artist = (request.form.get("artist") or "Artista desconhecido").strip()[:200] or "Artista desconhecido"
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
                "INSERT INTO tracks (id,title,artist,original_name,stored_name,mime,bytes,sha256) VALUES (?,?,?,?,?,?,?,?)",
                (track_id, title, artist, Path(incoming.filename).name, stored, EXTENSIONS[extension], len(content), digest),
            )
            db.commit()
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        row = db.execute("SELECT * FROM tracks WHERE id = ?", (track_id,)).fetchone()
    # Reaproveita a capa incorporada; as capas remotas também ficam em disco.
    # O carregamento da capa via GET tenta novamente quando a busca externa falhar.
    extract_cover(FILES / stored, track_id)
    return jsonify({"track": serialize(row), "duplicate": False}), 201


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
            "SELECT stored_name, title, artist FROM tracks WHERE id = ?",
            (track_id,),
        ).fetchone()

    if not row:
        return jsonify({"error": "Faixa não encontrada."}), 404

    audio_path = FILES / row["stored_name"]

    if not audio_path.is_file():
        return jsonify({"error": "Áudio não encontrado."}), 404

    album_cover = _album_cover_for_track(track_id)
    if album_cover:
        return send_file(album_cover, conditional=True)

    for extension in (".jpg", ".png", ".webp"):
        cover_path = COVERS / f"{track_id}{extension}"

        if cover_path.is_file():
            return send_file(cover_path, conditional=True)

    embedded = extract_cover(audio_path, track_id)
    if embedded:
        return send_file(embedded, conditional=True)

    with _COVER_LOCK:
        last_fail = _COVER_FAILED.get(track_id, 0)
    if time.monotonic() - last_fail < 600:
        return jsonify({"error": "Capa ainda não disponível."}), 404

    fetched = lookup_cover(row["artist"], row["title"], track_id, _album_tag(audio_path))
    if fetched:
        return send_file(fetched, conditional=True)
    with _COVER_LOCK:
        _COVER_FAILED[track_id] = time.monotonic()
    return jsonify({"error": "Nenhuma capa correspondente encontrada."}), 404



@library_bp.post("/api/library/tracks/<track_id>/refresh-cover")
def refresh_track_cover(track_id):
    with connection() as db:
        row = db.execute("SELECT id FROM tracks WHERE id=?", (track_id,)).fetchone()
    if row is None:
        return jsonify({"error":"Faixa não encontrada."}), 404
    with _COVER_LOCK:
        _COVER_FAILED.pop(track_id, None)
    album_cover = _album_cover_for_track(track_id)
    artwork = album_cover or ensure_cover(track_id)
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
    # Se esta faixa pertence a um álbum, a escolha aplica a mesma imagem ao álbum todo.
    with connection() as db:
        relation = db.execute("SELECT album_id FROM local_album_tracks WHERE track_id=?", (track_id,)).fetchone()
    cover_key = "album-" + relation["album_id"] if relation else track_id
    stored = cover_filename(data, cover_key)
    if not stored:
        return jsonify({"error": "Não foi possível salvar esta imagem."}), 400
    with _COVER_LOCK:
        _COVER_FAILED.pop(track_id, None)
        _COVER_DIAGNOSTICS[track_id] = "Capa personalizada enviada pelo usuário."
    return jsonify({"saved": True, "albumId": relation["album_id"] if relation else None,
                    "coverUrl": f"/api/library/tracks/{track_id}/cover"}), 200

# ----------------------------------------------------------------------
# DoomVault 1.2.2 — álbuns locais com uma capa compartilhada.
# Tabelas novas; não altera a tabela tracks nem os arquivos originais.
# ----------------------------------------------------------------------
_ALBUM_IDENTIFY_LOCK = threading.Lock()
_ALBUM_IDENTIFY = {"running": False, "done": 0, "total": 0, "assigned": 0, "ambiguous": 0,
                   "foundCovers": 0, "error": "", "finished": False}
_ALBUM_AUTO_META_LOCK = threading.Lock()


def _album_art(album_id: str):
    for suffix in (".jpg", ".png", ".webp"):
        candidate = COVERS / ("album-" + album_id + suffix)
        if candidate.is_file():
            return candidate
    return None


def _album_cover_for_track(track_id: str):
    with connection() as db:
        row = db.execute("SELECT album_id FROM local_album_tracks WHERE track_id=?", (track_id,)).fetchone()
    return _album_art(row["album_id"]) if row else None


def _get_or_create_album(db, artist: str, title: str):
    artist = str(artist).strip()[:200]
    title = str(title).strip()[:220]
    if not artist or not title:
        raise ValueError("Artista e título do álbum são obrigatórios.")
    a_key, t_key = _norm(artist), _norm(title)
    row = db.execute("SELECT id FROM local_albums WHERE artist_key=? AND title_key=?", (a_key, t_key)).fetchone()
    if row:
        return row["id"]
    album_id = uuid.uuid4().hex
    db.execute("INSERT INTO local_albums (id,artist,title,artist_key,title_key) VALUES (?,?,?,?,?)",
               (album_id, artist, title, a_key, t_key))
    return album_id


def _assign_album(db, track_id: str, album_id: str, method="manual"):
    # An artist cannot silently move to a completely different artist's album.
    track = db.execute("SELECT artist FROM tracks WHERE id=?", (track_id,)).fetchone()
    album = db.execute("SELECT artist FROM local_albums WHERE id=?", (album_id,)).fetchone()
    if not track or not album:
        return False
    if _norm(track["artist"]) != _norm(album["artist"]):
        return False
    db.execute("""INSERT INTO local_album_tracks (track_id,album_id,method) VALUES (?,?,?)
        ON CONFLICT(track_id) DO UPDATE SET album_id=excluded.album_id,method=excluded.method""",
        (track_id, album_id, method))
    return True


def _group_from_audio_tags():
    """The safe offline auto-identification: ID3/Vorbis album metadata."""
    _ALBUM_AUTO_META_LOCK.acquire()
    try:
        with connection() as db:
            unlinked = db.execute("""SELECT t.id,t.artist,t.stored_name FROM tracks t
                LEFT JOIN local_album_tracks link ON t.id=link.track_id
                LEFT JOIN track_metadata m ON m.track_id=t.id
                WHERE link.track_id IS NULL AND COALESCE(m.album_manual,0)=0""").fetchall()
            modified = False
            for row in unlinked:
                audio = FILES / row["stored_name"]
                if not audio.is_file():
                    continue
                album = _album_tag(audio).strip()
                if not album or _norm(album) in {"unknown album", "album desconhecido", "unknown", "single", "ytmusic"}:
                    continue
                group_id = _get_or_create_album(db, row["artist"], album)
                _assign_album(db, row["id"], group_id, "metadata")
                modified = True
            if modified:
                db.commit()
    finally:
        _ALBUM_AUTO_META_LOCK.release()


def _album_items():
    with connection() as db:
        rows = db.execute("""SELECT a.*, COUNT(link.track_id) AS track_count
            FROM local_albums a LEFT JOIN local_album_tracks link ON a.id=link.album_id
            GROUP BY a.id ORDER BY a.artist_key,a.title_key""").fetchall()
    return [{"id": r["id"], "artist": r["artist"], "title": r["title"],
             "count": r["track_count"], "hasCover": bool(_album_art(r["id"])),
             "coverUrl": f"/api/library/albums/{r['id']}/cover"} for r in rows]


def _album_artwork_candidates(artist, album):
    """Only full album releases with verified artist and album title."""
    q = urllib.parse.urlencode({"term": f"{artist} {album}", "entity": "album", "limit": 50, "country": "US"})
    items = _get_json("https://itunes.apple.com/search?" + q, timeout=8).get("results", [])
    matches = []
    for item in items:
        if _norm(item.get("artistName", "")) != _norm(artist):
            continue
        if _norm(item.get("collectionName", "")) != _norm(album):
            continue
        img = item.get("artworkUrl100")
        if isinstance(img, str):
            matches.append(img.replace("100x100bb", "600x600bb"))
    return list(dict.fromkeys(matches))


def _find_album_cover(album_id, *, preferred_urls=()):
    current = _album_art(album_id)
    if current:
        return current
    with connection() as db:
        row = db.execute("SELECT artist,title FROM local_albums WHERE id=?", (album_id,)).fetchone()
    if not row:
        return None
    candidates = list(dict.fromkeys(preferred_urls))
    try:
        candidates += [u for u in _album_artwork_candidates(row["artist"], row["title"]) if u not in candidates]
    except Exception as exc:
        _LOG.info("Album art lookup failed for %s: %s", row["title"], exc)
    for url in candidates:
        try:
            saved = _download_cover(url, "album-" + album_id)
            if saved:
                return saved
        except Exception:
            continue
    return None


def _itunes_album_candidates(artist: str, title: str):
    """No guessing based only on artist name; candidate track must also match."""
    q = urllib.parse.urlencode({"term": f"{artist} {title}", "entity": "song", "limit": 100, "country": "US"})
    data = _get_json("https://itunes.apple.com/search?" + q, timeout=8)
    candidates = {}
    for song in data.get("results", []):
        if _norm(song.get("artistName", "")) != _norm(artist):
            continue
        if not _same_title(title, song.get("trackName", "")):
            continue
        album_title = str(song.get("collectionName") or "").strip()
        album_id = song.get("collectionId")
        if not album_title or not album_id:
            continue
        if album_title.lower().endswith(" - single"):
            continue
        artwork = song.get("artworkUrl100")
        candidates[(str(album_id), _norm(artist))] = {
            "artist": artist, "title": album_title,
            "cover": artwork.replace("100x100bb", "600x600bb") if isinstance(artwork, str) else None,
        }
    return candidates


def _identify_worker():
    try:
        _group_from_audio_tags()
        with connection() as db:
            pending = [dict(r) for r in db.execute("""SELECT t.id,t.title,t.artist FROM tracks t
                LEFT JOIN local_album_tracks rel ON t.id=rel.track_id WHERE rel.track_id IS NULL""")]
        with _ALBUM_IDENTIFY_LOCK:
            _ALBUM_IDENTIFY.update(total=len(pending), done=0, assigned=0, ambiguous=0, foundCovers=0, error="")
        album_votes: dict[tuple[str, str], set[str]] = {}
        candidate_for_track = {}
        album_info = {}
        for item in pending:
            try:
                candidates = _itunes_album_candidates(item["artist"], item["title"])
            except Exception as exc:
                candidates = {}
                _LOG.info("Song album lookup failed for %s: %s", item["title"], exc)
            candidate_for_track[item["id"]] = candidates
            for album_key, info in candidates.items():
                album_votes.setdefault(album_key, set()).add(item["id"])
                album_info[album_key] = info
            with _ALBUM_IDENTIFY_LOCK:
                _ALBUM_IDENTIFY["done"] += 1
        assignments: dict[str, tuple] = {}
        # A release supported by several songs wins. Respect explicit edition
        # qualifiers (e.g. "2009 Remaster") before deciding between reissues.
        track_by_id = {item["id"]: item for item in pending}
        def edition_bonus(track_title, album_title):
            edition = re.search(r"((?:19|20)\d{2})\s*re-?master", track_title, flags=re.I)
            if not edition:
                return 0
            return 3 if re.search(re.escape(edition.group(1)) + r"\s*re-?master", album_title, flags=re.I) else 0
        for track_id, candidates in candidate_for_track.items():
            if not candidates:
                continue
            def score(key):
                return len(album_votes.get(key, ())) * 10 + edition_bonus(
                    track_by_id[track_id]["title"], album_info[key]["title"])
            ranked = sorted(candidates, key=score, reverse=True)
            if not ranked:
                continue
            best = ranked[0]
            strength = len(album_votes.get(best, ()))
            runner_up = score(ranked[1]) if len(ranked) > 1 else -1
            if strength < 2 or score(best) == runner_up:
                with _ALBUM_IDENTIFY_LOCK:
                    _ALBUM_IDENTIFY["ambiguous"] += 1
                continue
            assignments[track_id] = best
        # Commit atomically without altering any already manually-associated tracks.
        chosen = {}
        with connection() as db:
            for track_id, best in assignments.items():
                if db.execute("SELECT 1 FROM local_album_tracks WHERE track_id=?", (track_id,)).fetchone():
                    continue
                info = album_info[best]
                group_id = _get_or_create_album(db, info["artist"], info["title"])
                if _assign_album(db, track_id, group_id, "catalog"):
                    chosen[group_id] = info["cover"]
                    with _ALBUM_IDENTIFY_LOCK:
                        _ALBUM_IDENTIFY["assigned"] += 1
            db.commit()
        # One image for every track in each album (including groups found
        # from MP3/FLAC metadata), not one search per track.
        all_albums = _album_items()
        for album in all_albums:
            group_id = album["id"]
            if album["count"] == 0 or album["hasCover"]:
                continue
            cover = chosen.get(group_id)
            if _find_album_cover(group_id, preferred_urls=[cover] if cover else []):
                with _ALBUM_IDENTIFY_LOCK:
                    _ALBUM_IDENTIFY["foundCovers"] += 1
    except Exception as exc:
        _LOG.exception("Album identification failed")
        with _ALBUM_IDENTIFY_LOCK:
            _ALBUM_IDENTIFY["error"] = str(exc)[:250]
    finally:
        with _ALBUM_IDENTIFY_LOCK:
            _ALBUM_IDENTIFY["running"] = False
            _ALBUM_IDENTIFY["finished"] = True


def _sync_album_playlist_titles(db, album_id, title):
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='playlist_entries'").fetchone():
        db.execute("""UPDATE playlist_entries SET album=?
            WHERE source='local' AND track_id IN
            (SELECT track_id FROM local_album_tracks WHERE album_id=?)""", (title,album_id))


@library_bp.get("/api/library/albums/<album_id>/metadata/history")
def album_metadata_history(album_id):
    with connection() as db:
        if not db.execute("SELECT 1 FROM local_albums WHERE id=?", (album_id,)).fetchone():
            return jsonify({"error":"Álbum não encontrado."}), 404
        n = db.execute("SELECT COUNT(*) FROM local_album_title_history WHERE album_id=?", (album_id,)).fetchone()[0]
    return jsonify({"canUndo": bool(n), "changes": n})


@library_bp.patch("/api/library/albums/<album_id>/metadata")
def update_album_metadata(album_id):
    data = request.get_json(silent=True)
    if not isinstance(data,dict) or set(data)!={"title"} or not isinstance(data["title"],str):
        return jsonify({"error":"Informe o título do álbum."}), 400
    title = data["title"].strip()
    if not 1 <= len(title) <= 220:
        return jsonify({"error":"Título do álbum deve ter entre 1 e 220 caracteres."}), 400
    with connection() as db:
        old = db.execute("SELECT * FROM local_albums WHERE id=?", (album_id,)).fetchone()
        if not old:
            return jsonify({"error":"Álbum não encontrado."}), 404
        if old["title"] == title:
            return jsonify({"updated":False,"id":album_id,"title":title})
        title_key = _norm(title)
        conflict = db.execute("SELECT id FROM local_albums WHERE artist_key=? AND title_key=? AND id<>?",
                              (old["artist_key"],title_key,album_id)).fetchone()
        if conflict:
            return jsonify({"error":"Já existe um álbum com esse nome para este artista."}), 409
        db.execute("INSERT INTO local_album_title_history(album_id,old_title,old_title_key) VALUES (?,?,?)",
                   (album_id,old["title"],old["title_key"]))
        db.execute("UPDATE local_albums SET title=?,title_key=? WHERE id=?",(title,title_key,album_id))
        _sync_album_playlist_titles(db,album_id,title)
        db.commit()
    return jsonify({"updated":True,"id":album_id,"title":title,"canUndo":True})


@library_bp.post("/api/library/albums/<album_id>/metadata/undo")
def undo_album_metadata(album_id):
    with connection() as db:
        album = db.execute("SELECT * FROM local_albums WHERE id=?", (album_id,)).fetchone()
        if not album:
            return jsonify({"error":"Álbum não encontrado."}), 404
        old = db.execute("SELECT * FROM local_album_title_history WHERE album_id=? ORDER BY id DESC LIMIT 1",
                         (album_id,)).fetchone()
        if not old:
            return jsonify({"error":"Não há alteração de nome para desfazer."}), 409
        collision = db.execute("SELECT id FROM local_albums WHERE artist_key=? AND title_key=? AND id<>?",
                               (album["artist_key"],old["old_title_key"],album_id)).fetchone()
        if collision:
            return jsonify({"error":"Outro álbum está usando o nome anterior; não é possível restaurá-lo."}), 409
        db.execute("UPDATE local_albums SET title=?,title_key=? WHERE id=?",
                   (old["old_title"],old["old_title_key"],album_id))
        _sync_album_playlist_titles(db,album_id,old["old_title"])
        db.execute("DELETE FROM local_album_title_history WHERE id=?",(old["id"],))
        db.commit()
        count = db.execute("SELECT COUNT(*) FROM local_album_title_history WHERE album_id=?",(album_id,)).fetchone()[0]
    return jsonify({"restored":True,"title":old["old_title"],"canUndo":count>0})


@library_bp.get("/api/library/albums")
def list_local_albums():
    _group_from_audio_tags()
    return jsonify({"albums": _album_items()})


@library_bp.post("/api/library/albums")
def create_local_album():
    data = request.get_json(silent=True) or {}
    artist = str(data.get("artist") or "").strip()
    title = str(data.get("title") or "").strip()
    if not artist or not title or len(artist) > 200 or len(title) > 220:
        return jsonify({"error": "Informe artista e nome do álbum."}), 400
    with connection() as db:
        group_id = _get_or_create_album(db, artist, title)
        db.commit()
    return jsonify({"id": group_id}), 201


@library_bp.post("/api/library/albums/<album_id>/tracks")
def assign_local_album_tracks(album_id):
    data = request.get_json(silent=True) or {}
    ids = data.get("track_ids")
    if not isinstance(ids, list) or not ids or len(ids) > 500 or any(not isinstance(i, str) for i in ids):
        return jsonify({"error": "Selecione de 1 a 500 faixas."}), 400
    with connection() as db:
        exists = db.execute("SELECT id FROM local_albums WHERE id=?", (album_id,)).fetchone()
        if not exists:
            return jsonify({"error": "Álbum não encontrado."}), 404
        assigned = sum(bool(_assign_album(db, item, album_id)) for item in dict.fromkeys(ids))
        db.commit()
    return jsonify({"assigned": assigned, "ignored": len(set(ids)) - assigned})


@library_bp.post("/api/library/albums/<album_id>/cover-upload")
def upload_local_album_cover(album_id):
    with connection() as db:
        exists = db.execute("SELECT id FROM local_albums WHERE id=?", (album_id,)).fetchone()
    if not exists:
        return jsonify({"error": "Álbum não encontrado."}), 404
    uploaded = request.files.get("file")
    if not uploaded:
        return jsonify({"error": "Selecione JPG, PNG ou WebP."}), 400
    data = uploaded.stream.read(4 * 1024 * 1024 + 1)
    saved = cover_filename(data, "album-" + album_id)
    if not saved:
        return jsonify({"error": "Imagem inválida ou maior que 4 MB."}), 415
    return jsonify({"saved": True, "coverUrl": f"/api/library/albums/{album_id}/cover"})


@library_bp.get("/api/library/albums/<album_id>/cover")
def get_local_album_cover(album_id):
    cover = _album_art(album_id)
    if not cover:
        return jsonify({"error": "Capa do álbum não definida."}), 404
    return send_file(cover, conditional=True)


@library_bp.post("/api/library/albums/<album_id>/cover-search")
def find_local_album_cover(album_id):
    cover = _find_album_cover(album_id)
    return jsonify({"found": bool(cover), "coverUrl": f"/api/library/albums/{album_id}/cover" if cover else None})


@library_bp.post("/api/library/albums/identify")
def start_identify_albums():
    with _ALBUM_IDENTIFY_LOCK:
        if _ALBUM_IDENTIFY["running"]:
            return jsonify({"status": dict(_ALBUM_IDENTIFY)}), 202
        _ALBUM_IDENTIFY.update(running=True, finished=False, done=0, total=0,
                               assigned=0, ambiguous=0, foundCovers=0, error="")
    threading.Thread(target=_identify_worker, daemon=True).start()
    return jsonify({"status": dict(_ALBUM_IDENTIFY)}), 202


@library_bp.get("/api/library/albums/identify/status")
def identify_album_status():
    with _ALBUM_IDENTIFY_LOCK:
        status = dict(_ALBUM_IDENTIFY)
    return jsonify({"status": status})


# BZTUNE_V142_DUPES_API_BEGIN — consultar possíveis duplicatas sem modificar músicas.
from .library_duplicates import scan_duplicates as _scan_duplicates_v142


@library_bp.get("/api/library/duplicates")
def list_library_duplicates():
    with connection() as db:
        rows = db.execute("""SELECT t.id, t.title, t.artist, t.sha256,
            t.original_name AS filename, t.bytes, t.mime,
            a.title AS album, m.release_year AS year, m.track_number
            FROM tracks AS t
            LEFT JOIN local_album_tracks AS link ON t.id=link.track_id
            LEFT JOIN local_albums AS a ON a.id=link.album_id
            LEFT JOIN track_metadata AS m ON m.track_id=t.id
            ORDER BY t.artist, t.title, t.id""").fetchall()
    result = _scan_duplicates_v142([dict(row) for row in rows])
    return jsonify(result)
# BZTUNE_V142_DUPES_API_END

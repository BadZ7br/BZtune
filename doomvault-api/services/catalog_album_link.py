"""BZtune: metadata de lançamentos confirmados pelo ID do catálogo.

Não altera os arquivos de áudio. Não usa coincidência de título para vincular
faixas: precisa do ID de origem já salvo na tabela track_sources.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from api import library_api as lib

BROWSE_ID = re.compile(r"^[A-Za-z0-9_-]{6,180}$")
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _artist_names(obj: dict) -> list[str]:
    found = []
    for item in obj.get("artists") or []:
        if isinstance(item, dict) and isinstance(item.get("name"), str):
            found.append(item["name"])
    if not found and isinstance(obj.get("artist"), str):
        found.append(obj["artist"])
    return found


def verified_release(yt: Any, release_id: str, artist: str, expected_title: str = "") -> dict:
    """Confere ID, artista e título antes de qualquer alteração no SQLite."""
    if not isinstance(release_id, str) or not BROWSE_ID.fullmatch(release_id):
        raise ValueError("ID do álbum inválido.")
    raw = yt.get_album(release_id)
    if not isinstance(raw, dict):
        raise ValueError("O catálogo não retornou o álbum solicitado.")
    title = str(raw.get("title") or "").strip()
    if not title:
        raise ValueError("O catálogo não informou o título do álbum.")
    names = _artist_names(raw)
    if not any(lib._norm(name) == lib._norm(artist) for name in names):
        raise ValueError("O artista não corresponde ao álbum selecionado.")
    if expected_title and lib._base_title(title) != lib._base_title(expected_title):
        raise ValueError("O título retornado não corresponde ao lançamento selecionado.")
    videos = []
    for row in raw.get("tracks") or []:
        if isinstance(row, dict) and isinstance(row.get("videoId"), str) and VIDEO_ID.fullmatch(row["videoId"]):
            videos.append({"videoId": row["videoId"], "title": str(row.get("title") or "Sem título")})
    if not videos:
        raise ValueError("O lançamento não possui faixas identificáveis no catálogo.")
    # Thumbnail da página identificada por ID, nunca de uma busca por nome da faixa.
    cover = None
    for img in reversed(raw.get("thumbnails") or []):
        if isinstance(img, dict) and isinstance(img.get("url"), str) and lib._trusted_image_url(img["url"]):
            cover = img["url"]
            break
    return {"id": release_id, "title": title, "artist": artist, "cover": cover, "tracks": videos}


def album_for_track(yt: Any, artist: str, title: str, video_id: str, album_id: str | None = None) -> dict | None:
    """Somente retorna lançamento que contém o ID exato do vídeo da música."""
    if album_id:
        release = verified_release(yt, album_id, artist)
        if not any(t["videoId"] == video_id for t in release["tracks"]):
            raise ValueError("A música não pertence ao lançamento selecionado.")
        return release
    # Para resultados avulsos, tenta obter a referência explícita de álbum do catálogo.
    try:
        songs = yt.search(f"{artist} {title}", filter="songs", limit=30)
        for song in songs:
            if song.get("videoId") != video_id:
                continue
            item = song.get("album") or {}
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                return None
            try:
                release = verified_release(yt, item["id"], artist)
            except (ValueError, KeyError, TypeError):
                return None
            return release if any(t["videoId"] == video_id for t in release["tracks"]) else None
    except Exception:
        return None
    return None


def associate_release(release: dict, requested_video_ids: list[str] | None = None) -> dict:
    """Vincula somente fontes confirmadas; nunca substitui associações existentes.

    Cria grupo distinto por ID de lançamento, mesmo quando duas edições têm
    exatamente o mesmo título. A tabela existente continua sem alterações.
    """
    known = {row["videoId"] for row in release["tracks"]}
    wanted = known if requested_video_ids is None else known.intersection(requested_video_ids)
    if not wanted:
        return {"matched": 0, "assigned": 0, "existing": 0, "skipped": 0, "coverFound": False}
    with lib.connection() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS catalog_album_links (
            release_id TEXT PRIMARY KEY,
            album_id TEXT NOT NULL REFERENCES local_albums(id) ON DELETE CASCADE
        )""")
        placeholders = ",".join("?" for _ in wanted)
        source_rows = db.execute(f"""SELECT source_id,track_id FROM track_sources
            WHERE source_id IN ({placeholders})""", tuple(wanted)).fetchall()
        # Evita criar um álbum sem nenhuma música identificada.
        if not source_rows:
            db.commit()
            return {"matched": 0, "assigned": 0, "existing": 0, "skipped": 0, "coverFound": False}
        found = db.execute("SELECT album_id FROM catalog_album_links WHERE release_id=?", (release["id"],)).fetchone()
        if found:
            group_id = found["album_id"]
        else:
            # O sufixo está apenas na chave normalizada, não no título visível.
            # Assim, dois remasters homônimos não compartilham a capa por acidente.
            artist_key = lib._norm(release["artist"])
            title_key = lib._norm(release["title"]) + "::catalog::" + release["id"]
            old = db.execute("SELECT id FROM local_albums WHERE artist_key=? AND title_key=?", (artist_key, title_key)).fetchone()
            group_id = old["id"] if old else uuid.uuid4().hex
            if not old:
                db.execute("""INSERT INTO local_albums (id,artist,title,artist_key,title_key)
                    VALUES (?,?,?,?,?)""", (group_id, release["artist"], release["title"], artist_key, title_key))
            db.execute("INSERT INTO catalog_album_links(release_id,album_id) VALUES (?,?)", (release["id"], group_id))
        assigned = existing = skipped = 0
        for row in source_rows:
            current = db.execute("SELECT album_id FROM local_album_tracks WHERE track_id=?", (row["track_id"],)).fetchone()
            if current:
                if current["album_id"] == group_id:
                    existing += 1
                else:
                    skipped += 1  # edição manual ou outro lançamento: preservar
                continue
            if lib._assign_album(db, row["track_id"], group_id, "catalog-id"):
                assigned += 1
            else:
                skipped += 1  # artista da música diferente do artista do álbum
        db.commit()
    cover_found = bool(lib._album_art(group_id))
    if not cover_found and release.get("cover"):
        try:
            cover_found = bool(lib._download_cover(release["cover"], "album-" + group_id))
        except Exception:
            pass
    return {"matched": len(source_rows), "assigned": assigned, "existing": existing,
            "skipped": skipped, "coverFound": cover_found, "albumId": group_id}

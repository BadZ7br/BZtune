"""DoomVault playlists mistas: faixas offline e referências do catálogo online.

Migração NÃO DESTRUTIVA: preserva playlists e playlist_items antigos; a primeira
inicialização copia entradas antigas para playlist_entries (marcador versionado).
Rotas de capas v1.0 mantidas. Cópia de segurança do SQLite recomendada.
"""
from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path
from flask import Blueprint, jsonify, request, send_file
from library_api import BASE, connection, serialize

playlists_bp = Blueprint("doomvault_playlists", __name__)
PLAYLIST_COVERS = BASE / "playlist_covers"


def db_open():
    db = connection()
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS playlist_items (
            playlist_id TEXT NOT NULL,
            track_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            PRIMARY KEY (playlist_id, track_id),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS playlist_entries (
            id TEXT PRIMARY KEY,
            playlist_id TEXT NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('local', 'web')),
            ref_key TEXT NOT NULL,
            track_id TEXT,
            video_id TEXT,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            album TEXT NOT NULL DEFAULT '',
            cover TEXT,
            position INTEGER NOT NULL,
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            UNIQUE (playlist_id, ref_key)
        );
        CREATE INDEX IF NOT EXISTS idx_dv_playlist_entries_order
            ON playlist_entries(playlist_id, position);
        CREATE TABLE IF NOT EXISTS doomvault_schema_state (
            key TEXT PRIMARY KEY, value TEXT NOT NULL
        );
    """)
    names = {row[1] for row in db.execute("PRAGMA table_info(playlists)")}
    if "cover_name" not in names:
        db.execute("ALTER TABLE playlists ADD COLUMN cover_name TEXT")
    # Faz a migração apenas uma vez, para que uma música removida não volte.
    migrated = db.execute("SELECT 1 FROM doomvault_schema_state WHERE key='mixed_playlists_v1'").fetchone()
    if not migrated:
        legacy = db.execute("""SELECT pi.playlist_id, pi.track_id, pi.position, t.title, t.artist
            FROM playlist_items pi JOIN tracks t ON t.id=pi.track_id
            ORDER BY pi.playlist_id, pi.position""").fetchall()
        for row in legacy:
            db.execute("""INSERT OR IGNORE INTO playlist_entries
                (id,playlist_id,source,ref_key,track_id,video_id,title,artist,position)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (uuid.uuid4().hex, row["playlist_id"], "local", "local:" + row["track_id"],
                 row["track_id"], None, row["title"], row["artist"], row["position"]))
        db.execute("INSERT INTO doomvault_schema_state(key,value) VALUES ('mixed_playlists_v1','done')")
    # Remove referências de arquivos locais que tenham sido apagados da biblioteca.
    db.execute("""DELETE FROM playlist_entries WHERE source='local' AND
        track_id NOT IN (SELECT id FROM tracks)""")
    db.commit()
    return db


def get_playlist(db, playlist_id):
    return db.execute("SELECT * FROM playlists WHERE id=?", (playlist_id,)).fetchone()


def entry_json(db, entry):
    base = {
        "id": entry["id"], "source": entry["source"],
        "videoId": entry["video_id"] or ("library:" + entry["track_id"] if entry["track_id"] else ""),
        "title": entry["title"], "artist": entry["artist"],
        "album": entry["album"] or None, "cover": entry["cover"],
        "trackId": entry["track_id"], "audioUrl": None,
    }
    local = None
    if entry["source"] == "local":
        local = db.execute("SELECT * FROM tracks WHERE id=?", (entry["track_id"],)).fetchone()
    elif entry["source"] == "web":
        # Referências online priorizam uma cópia local quando título+artista coincidem.
        local = db.execute("""SELECT * FROM tracks WHERE
            LOWER(TRIM(title))=LOWER(TRIM(?)) AND LOWER(TRIM(artist))=LOWER(TRIM(?))
            ORDER BY created_at DESC LIMIT 1""", (entry["title"], entry["artist"])).fetchone()
    if local:
        local_data = serialize(local)
        base["audioUrl"] = local_data["audioUrl"]
        base["cover"] = local_data.get("coverUrl") or base["cover"]
        base["trackId"] = local["id"]
    return base


def playlist_json(db, row):
    entries = db.execute("""SELECT * FROM playlist_entries WHERE playlist_id=?
        ORDER BY position,id""", (row["id"],)).fetchall()
    return {
        "id": row["id"], "name": row["name"], "description": row["description"],
        "created_at": row["created_at"],
        "coverUrl": f"/api/playlists/{row['id']}/cover" if row["cover_name"] else None,
        "tracks": [entry_json(db, x) for x in entries], "count": len(entries),
    }


def error(message, status=400):
    return jsonify({"error": message}), status


@playlists_bp.get("/api/playlists")
def list_playlists():
    with db_open() as db:
        rows = db.execute("SELECT * FROM playlists ORDER BY created_at DESC, name").fetchall()
        return jsonify({"playlists": [playlist_json(db, x) for x in rows]})


@playlists_bp.post("/api/playlists")
def create_playlist():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name") or "").strip()[:100]
    if not name:
        return error("Informe um nome para a playlist.")
    description = str(data.get("description") or "").strip()[:400]
    playlist_id = uuid.uuid4().hex
    with db_open() as db:
        db.execute("INSERT INTO playlists(id,name,description) VALUES (?,?,?)", (playlist_id,name,description))
        db.commit()
        return jsonify({"playlist": playlist_json(db, get_playlist(db, playlist_id))}), 201


@playlists_bp.patch("/api/playlists/<playlist_id>")
def edit_playlist(playlist_id):
    data = request.get_json(silent=True) or {}
    with db_open() as db:
        if not get_playlist(db, playlist_id):
            return error("Playlist não encontrada.", 404)
        if "name" in data:
            name = str(data.get("name") or "").strip()[:100]
            if not name:
                return error("Nome inválido.")
            db.execute("UPDATE playlists SET name=? WHERE id=?", (name,playlist_id))
        if "description" in data:
            db.execute("UPDATE playlists SET description=? WHERE id=?", (str(data.get("description") or "")[:400],playlist_id))
        db.commit()
        return jsonify({"playlist": playlist_json(db, get_playlist(db,playlist_id))})


@playlists_bp.delete("/api/playlists/<playlist_id>")
def delete_playlist(playlist_id):
    with db_open() as db:
        row = get_playlist(db, playlist_id)
        if not row:
            return error("Playlist não encontrada.", 404)
        db.execute("DELETE FROM playlists WHERE id=?", (playlist_id,))
        db.commit()
    if row["cover_name"]:
        (PLAYLIST_COVERS / row["cover_name"]).unlink(missing_ok=True)
    return jsonify({"deleted": True})


def validated_entry(db, data):
    track_id = str(data.get("track_id") or "").strip()
    if track_id:
        track = db.execute("SELECT * FROM tracks WHERE id=?", (track_id,)).fetchone()
        if not track:
            raise ValueError("Música local não encontrada.")
        return {"source":"local", "ref_key":"local:"+track_id, "track_id":track_id,
                "video_id":None, "title":track["title"], "artist":track["artist"], "album":"", "cover":None}
    video_id = str(data.get("video_id") or data.get("videoId") or "").strip()
    # IDs de reprodução do YouTube têm 11 caracteres. URLs não são aceitas aqui.
    if len(video_id) != 11 or not all(ch.isalnum() or ch in "-_" for ch in video_id):
        raise ValueError("A música online precisa de um video_id válido.")
    title = str(data.get("title") or "").strip()[:200]
    artist = str(data.get("artist") or "").strip()[:200]
    if not title or not artist:
        raise ValueError("Informe título e artista.")
    cover = data.get("cover")
    cover = str(cover)[:1200] if isinstance(cover, str) and cover.startswith("https://") else None
    return {"source":"web", "ref_key":"web:"+video_id, "track_id":None,
            "video_id":video_id, "title":title, "artist":artist,
            "album":str(data.get("album") or "")[:200], "cover":cover}


def add_entry(db, playlist_id, item, pos):
    parsed = validated_entry(db, item)
    db.execute("""INSERT OR IGNORE INTO playlist_entries
        (id, playlist_id, source, ref_key, track_id, video_id, title, artist, album, cover, position)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (uuid.uuid4().hex,playlist_id,parsed["source"],parsed["ref_key"],parsed["track_id"],
         parsed["video_id"],parsed["title"],parsed["artist"],parsed["album"],parsed["cover"],pos))
    return db.execute("SELECT changes()").fetchone()[0] == 1


@playlists_bp.post("/api/playlists/<playlist_id>/tracks")
def add_track(playlist_id):
    data = request.get_json(silent=True) or {}
    with db_open() as db:
        row = get_playlist(db, playlist_id)
        if not row:
            return error("Playlist não encontrada.",404)
        last = db.execute("SELECT COALESCE(MAX(position),-1) FROM playlist_entries WHERE playlist_id=?",(playlist_id,)).fetchone()[0]
        try:
            inserted = add_entry(db, playlist_id, data, last+1)
        except ValueError as exc:
            return error(str(exc))
        if not inserted:
            return error("Música já está na playlist.",409)
        db.commit()
        return jsonify({"playlist":playlist_json(db,row)}),201


@playlists_bp.post("/api/playlists/<playlist_id>/tracks/bulk")
def add_tracks_bulk(playlist_id):
    data = request.get_json(silent=True) or {}
    items = data.get("tracks")
    if not isinstance(items,list) or not (1 <= len(items) <= 200):
        return error("Envie de 1 a 200 músicas.")
    with db_open() as db:
        row = get_playlist(db,playlist_id)
        if not row:
            return error("Playlist não encontrada.",404)
        position = db.execute("SELECT COALESCE(MAX(position),-1) FROM playlist_entries WHERE playlist_id=?",(playlist_id,)).fetchone()[0] + 1
        added = duplicates = invalid = 0
        for item in items:
            if not isinstance(item,dict):
                invalid += 1
                continue
            try:
                if add_entry(db,playlist_id,item,position):
                    added += 1
                    position += 1
                else:
                    duplicates += 1
            except ValueError:
                invalid += 1
        db.commit()
        return jsonify({"added":added,"duplicates":duplicates,"invalid":invalid,
                        "playlist":playlist_json(db,row)})


@playlists_bp.delete("/api/playlists/<playlist_id>/entries/<entry_id>")
def remove_entry(playlist_id,entry_id):
    with db_open() as db:
        row=get_playlist(db,playlist_id)
        if not row:
            return error("Playlist não encontrada.",404)
        deleted=db.execute("DELETE FROM playlist_entries WHERE id=? AND playlist_id=?",(entry_id,playlist_id)).rowcount
        db.commit()
        return jsonify({"deleted":bool(deleted),"playlist":playlist_json(db,row)})


# Compatibilidade com a rota da versão antiga.
@playlists_bp.delete("/api/playlists/<playlist_id>/tracks/<track_id>")
def remove_track_legacy(playlist_id,track_id):
    with db_open() as db:
        row=get_playlist(db,playlist_id)
        if not row:
            return error("Playlist não encontrada.",404)
        db.execute("DELETE FROM playlist_entries WHERE playlist_id=? AND (track_id=? OR id=?)",(playlist_id,track_id,track_id))
        db.commit()
        return jsonify({"playlist":playlist_json(db,row)})


@playlists_bp.put("/api/playlists/<playlist_id>/order")
def set_order(playlist_id):
    data=request.get_json(silent=True) or {}
    ids=data.get("entry_ids",data.get("track_ids"))
    if not isinstance(ids,list) or len(ids)!=len(set(map(str,ids))) or not all(isinstance(x,str) for x in ids):
        return error("Ordem inválida.")
    with db_open() as db:
        row=get_playlist(db,playlist_id)
        if not row:
            return error("Playlist não encontrada.",404)
        existing=db.execute("SELECT id,track_id FROM playlist_entries WHERE playlist_id=?",(playlist_id,)).fetchall()
        by_track={r["track_id"]:r["id"] for r in existing if r["track_id"]}
        order=[by_track.get(i,i) for i in ids]
        if set(order)!={r["id"] for r in existing}:
            return error("A ordem precisa conter todas as músicas.")
        for i,entry_id in enumerate(order):
            db.execute("UPDATE playlist_entries SET position=? WHERE playlist_id=? AND id=?",(i,playlist_id,entry_id))
        db.commit()
        return jsonify({"playlist":playlist_json(db,row)})


@playlists_bp.post("/api/playlists/<playlist_id>/cover")
def upload_cover(playlist_id):
    with db_open() as db:
        if not get_playlist(db,playlist_id):
            return error("Playlist não encontrada.",404)
    upload=request.files.get("file")
    if not upload:
        return error("Selecione uma imagem.")
    content=upload.stream.read(3*1024*1024+1)
    if not content or len(content)>3*1024*1024:
        return error("Imagem vazia ou maior que 3 MiB.",413)
    if content.startswith(b"\xff\xd8\xff"):
        ext=".jpg"
    elif content.startswith(b"\x89PNG\r\n\x1a\n"):
        ext=".png"
    elif content[:4]==b"RIFF" and content[8:12]==b"WEBP":
        ext=".webp"
    else:
        return error("Use JPG, PNG ou WebP.",415)
    PLAYLIST_COVERS.mkdir(parents=True,exist_ok=True)
    with db_open() as db:
        old=get_playlist(db,playlist_id)["cover_name"]
        filename=f"{playlist_id}{ext}"
        (PLAYLIST_COVERS/filename).write_bytes(content)
        db.execute("UPDATE playlists SET cover_name=? WHERE id=?",(filename,playlist_id))
        db.commit()
    if old and old!=filename:
        (PLAYLIST_COVERS/old).unlink(missing_ok=True)
    return jsonify({"coverUrl":f"/api/playlists/{playlist_id}/cover"})


@playlists_bp.get("/api/playlists/<playlist_id>/cover")
def get_cover(playlist_id):
    with db_open() as db:
        row=get_playlist(db,playlist_id)
    if not row or not row["cover_name"]:
        return error("Capa não encontrada.",404)
    path=PLAYLIST_COVERS/row["cover_name"]
    if not path.is_file():
        return error("Capa não encontrada.",404)
    return send_file(path,conditional=True)


@playlists_bp.delete("/api/playlists/<playlist_id>/cover")
def remove_cover(playlist_id):
    with db_open() as db:
        row=get_playlist(db,playlist_id)
        if not row:
            return error("Playlist não encontrada.",404)
        filename=row["cover_name"]
        db.execute("UPDATE playlists SET cover_name=NULL WHERE id=?",(playlist_id,))
        db.commit()
    if filename:
        (PLAYLIST_COVERS/filename).unlink(missing_ok=True)
    return jsonify({"removed":True})

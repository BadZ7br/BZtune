"""BZtune v1.6 - estatísticas locais, sem telemetry externa.

O identificador da sessão é idempotente: atualizações acumuladas de uma mesma
sessão nunca somam o mesmo segundo duas vezes. O schema não altera as tabelas
tracks/playlists existentes.
"""
from __future__ import annotations

import datetime as dt
from contextlib import closing
import re
import sqlite3
from typing import Any

from api.library_api import connection

ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{8,100}$")


def open_db() -> sqlite3.Connection:
    db = connection()
    db.execute("""CREATE TABLE IF NOT EXISTS bztune_listens (
        session_id TEXT PRIMARY KEY,
        track_key TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL CHECK(source IN ('local','online')),
        seconds REAL NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    db.execute("CREATE INDEX IF NOT EXISTS idx_bztune_listens_started ON bztune_listens(started_at)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_bztune_listens_artist ON bztune_listens(artist)")
    db.commit()
    return db


def normalized_key(db: sqlite3.Connection, raw: str) -> str:
    """Mapeia ID local para uma referência de catálogo quando possível."""
    if raw.startswith("library:"):
        local_id = raw[8:]
        if not re.fullmatch(r"[a-zA-Z0-9_-]{8,100}", local_id):
            return raw[:128]
        try:
            row = db.execute("SELECT source_id FROM track_sources WHERE track_id=? ORDER BY source_id LIMIT 1", (local_id,)).fetchone()
            if row and re.fullmatch(r"[a-zA-Z0-9_-]{11}", str(row[0])):
                return "yt:" + str(row[0])
        except sqlite3.OperationalError:
            pass
        return "local:" + local_id
    if re.fullmatch(r"[a-zA-Z0-9_-]{11}", raw):
        return "yt:" + raw
    return raw[:128]


def save_progress(data: dict[str, Any]) -> dict[str, Any]:
    session = str(data.get("sessionId") or "")
    if not ID_PATTERN.fullmatch(session):
        raise ValueError("Sessão inválida")
    raw_key = str(data.get("videoId") or "")
    if not raw_key or len(raw_key) > 128:
        raise ValueError("ID da faixa inválido")
    title = str(data.get("title") or "").strip()[:240]
    artist = str(data.get("artist") or "").strip()[:240]
    album = str(data.get("album") or "").strip()[:240]
    if not title or not artist:
        raise ValueError("Informe título e artista")
    source = str(data.get("source") or "online")
    if source not in ("online", "local"):
        raise ValueError("Fonte inválida")
    try:
        seconds = float(data.get("seconds") or 0)
    except (TypeError, ValueError):
        raise ValueError("Tempo inválido") from None
    if not 0 <= seconds <= 6 * 60 * 60 or seconds != seconds:
        raise ValueError("Tempo fora do limite")
    with closing(open_db()) as db:
        track_key = normalized_key(db, raw_key)
        db.execute("""INSERT INTO bztune_listens
            (session_id,track_key,title,artist,album,source,seconds)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(session_id) DO UPDATE SET
              seconds=MAX(bztune_listens.seconds,excluded.seconds),
              updated_at=CURRENT_TIMESTAMP""",
            (session, track_key, title, artist, album, source, round(seconds, 2)))
        db.commit()
    return {"ok": True, "counted": seconds >= 30}


def _period_clause(period: str) -> tuple[str, tuple[str, ...]]:
    if period == "week":
        return "WHERE started_at >= datetime('now','-7 days')", ()
    if period == "month":
        return "WHERE started_at >= datetime('now','-30 days')", ()
    if period == "year":
        return "WHERE started_at >= datetime('now','-365 days')", ()
    return "", ()


def summary(period: str = "all") -> dict[str, Any]:
    clause, args = _period_clause(period)
    with closing(open_db()) as db:
        totals = db.execute(f"""SELECT COALESCE(SUM(seconds),0) total_seconds,
            COALESCE(SUM(CASE WHEN seconds>=30 THEN 1 ELSE 0 END),0) plays,
            COUNT(DISTINCT artist) artists,
            COUNT(DISTINCT track_key) tracks FROM bztune_listens {clause}""", args).fetchone()
        artists = [dict(row) for row in db.execute(f"""SELECT artist AS name,
            ROUND(SUM(seconds)) AS seconds,
            SUM(CASE WHEN seconds>=30 THEN 1 ELSE 0 END) AS plays
            FROM bztune_listens {clause} GROUP BY artist ORDER BY seconds DESC LIMIT 15""", args)]
        tracks = [dict(row) for row in db.execute(f"""SELECT track_key AS id,
            MAX(title) AS title, MAX(artist) AS artist, MAX(album) AS album,
            ROUND(SUM(seconds)) AS seconds,
            SUM(CASE WHEN seconds>=30 THEN 1 ELSE 0 END) AS plays
            FROM bztune_listens {clause} GROUP BY track_key ORDER BY seconds DESC LIMIT 20""", args)]
        # Usa um predicado extra compatível com SELECT filtrado ou não filtrado.
        album_clause = clause + (" AND " if clause else " WHERE ") + "album <> ''"
        albums = [dict(row) for row in db.execute(f"""SELECT album AS name,artist, ROUND(SUM(seconds)) AS seconds,
            SUM(CASE WHEN seconds>=30 THEN 1 ELSE 0 END) AS plays
            FROM bztune_listens {album_clause} GROUP BY artist,album ORDER BY seconds DESC LIMIT 12""", args)]
        daily = [dict(row) for row in db.execute(f"""SELECT date(started_at) AS day,
            ROUND(SUM(seconds)) AS seconds, COUNT(*) AS sessions
            FROM bztune_listens {clause} GROUP BY date(started_at) ORDER BY day DESC LIMIT 90""", args)]
        history = [dict(row) for row in db.execute(f"""SELECT session_id AS id,title,artist,album,source,
            ROUND(seconds) AS seconds,started_at FROM bztune_listens {clause}
            ORDER BY started_at DESC LIMIT 150""", args)]
        return {
            "period": period, "totals": {"seconds": round(totals[0]), "plays": totals[1], "artists": totals[2], "tracks": totals[3]},
            "artists": artists,"tracks":tracks,"albums":albums,"daily":list(reversed(daily)),"history":history,
            "thresholdSeconds": 30,
        }


def wrapped(year: int, month: int = 0) -> dict[str, Any]:
    if not 2000 <= year <= dt.datetime.now().year + 1 or month not in range(13):
        raise ValueError("Período inválido")
    with closing(open_db()) as db:
        clause = "WHERE strftime('%Y',started_at)=?" + (" AND strftime('%m',started_at)=?" if month else "")
        args = (str(year), f"{month:02d}") if month else (str(year),)
        row = db.execute(f"SELECT COALESCE(SUM(seconds),0), SUM(CASE WHEN seconds>=30 THEN 1 ELSE 0 END),COUNT(DISTINCT artist) FROM bztune_listens {clause}",args).fetchone()
        top = [dict(r) for r in db.execute(f"SELECT artist AS name, ROUND(SUM(seconds)) AS seconds FROM bztune_listens {clause} GROUP BY artist ORDER BY seconds DESC LIMIT 5",args)]
        monthly = [dict(r) for r in db.execute(f"SELECT strftime('%Y-%m',started_at) AS month,ROUND(SUM(seconds)) AS seconds FROM bztune_listens {clause} GROUP BY month ORDER BY month",args)]
    return {"year": year,"month":month or None,"seconds":round(row[0] or 0),"plays":row[1] or 0,"uniqueArtists":row[2] or 0,"topArtists":top,"months":monthly}


def clear_history() -> int:
    with closing(open_db()) as db:
        rows = db.execute("SELECT COUNT(*) FROM bztune_listens").fetchone()[0]
        db.execute("DELETE FROM bztune_listens")
        db.commit()
    return int(rows)


def full_history() -> list[dict[str, Any]]:
    """Exportação CSV sem o limite de linhas da interface."""
    with closing(open_db()) as db:
        return [dict(row) for row in db.execute("""SELECT started_at,artist,title,album,source,
            ROUND(seconds) AS seconds FROM bztune_listens ORDER BY started_at DESC""")]

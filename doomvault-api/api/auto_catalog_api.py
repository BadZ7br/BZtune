"""DoomVault: discovery through ytmusicapi; downloads through existing yt-dlp worker.
Use only with content you are entitled to save. Does not bypass DRM.
"""
from __future__ import annotations

import re
import threading
import time
import uuid
import unicodedata
from flask import Blueprint, jsonify, request
from ytmusicapi import YTMusic
from api.downloads_api import JOBS, LOCK, MAX_CONCURRENT
from services.ytdlp_worker import enqueue_ytdlp

auto_catalog_bp = Blueprint("doomvault_auto_catalog", __name__)
BATCHES: dict[str, dict] = {}
BATCH_LOCK = threading.Lock()

def normalized(s: str) -> str:
    return " ".join("".join(c for c in unicodedata.normalize("NFKD", str(s).lower()) if not unicodedata.combining(c)).split())

def artist_match(row: dict, artist: str) -> bool:
    names = [a.get("name", "") for a in row.get("artists", []) if isinstance(a, dict)]
    return any(normalized(n) == normalized(artist) for n in names)

def resolve(artist: str, title: str, kind: str) -> list[dict]:
    yt = YTMusic()
    if kind == "track":
        results = yt.search(f"{artist} {title}", filter="songs", limit=20)
        exact = [x for x in results if normalized(x.get("title", "")) == normalized(title) and artist_match(x, artist) and x.get("videoId")]
        if not exact:
            raise ValueError("Não encontrei a faixa exata no catálogo.")
        item = exact[0]
        return [{"title": item["title"], "artist": artist, "videoId": item["videoId"]}]
    results = yt.search(f"{artist} {title}", filter="albums", limit=20)
    matching = [x for x in results if normalized(x.get("title", "")) == normalized(title) and artist_match(x, artist) and x.get("browseId")]
    if not matching:
        raise ValueError("Não encontrei o lançamento exato no catálogo.")
    album = yt.get_album(matching[0]["browseId"])
    tracks = []
    for item in album.get("tracks", []):
        video_id = item.get("videoId")
        if video_id and re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            tracks.append({"title": item.get("title") or "Sem título", "artist": artist, "videoId": video_id})
    if not tracks:
        raise ValueError("O álbum não possui IDs de faixas reproduzíveis.")
    return tracks

def snapshot(batch_id: str):
    with BATCH_LOCK:
        state = dict(BATCHES[batch_id])
        state["errors"] = list(state["errors"])
    with LOCK:
        job = dict(JOBS.get(state["current_job"], {})) if state.get("current_job") else {}
    state["current"] = {"status": job.get("status"), "downloaded": job.get("downloaded", 0), "total": job.get("total"), "error": job.get("error")}
    return state

def run_batch(batch_id: str, artist: str, title: str, kind: str):
    try:
        items = resolve(artist, title, kind)
        with BATCH_LOCK:
            BATCHES[batch_id]["total"] = len(items)
            BATCHES[batch_id]["status"] = "downloading"
        for item in items:
            while True:
                try:
                    # Existing worker enforces a global concurrency limit.
                    job = enqueue_ytdlp(f"https://www.youtube.com/watch?v={item['videoId']}", item["title"], item["artist"], JOBS, LOCK, MAX_CONCURRENT)
                    break
                except ValueError as exc:
                    if "simultâneos" not in str(exc):
                        raise
                    time.sleep(1)
            with BATCH_LOCK:
                BATCHES[batch_id]["current_job"] = job["id"]
                BATCHES[batch_id]["current_title"] = item["title"]
            while True:
                time.sleep(0.6)
                with LOCK:
                    status = JOBS[job["id"]]["status"]
                    failure = JOBS[job["id"]].get("error")
                if status in ("complete", "error"):
                    break
            with BATCH_LOCK:
                if status == "complete":
                    BATCHES[batch_id]["completed"] += 1
                else:
                    BATCHES[batch_id]["errors"].append(f"{item['title']}: {failure or 'erro desconhecido'}")
        with BATCH_LOCK:
            state = BATCHES[batch_id]
            state["status"] = "complete" if not state["errors"] else ("partial" if state["completed"] else "error")
    except Exception as exc:
        with BATCH_LOCK:
            BATCHES[batch_id]["errors"].append(str(exc)[:300])
            BATCHES[batch_id]["status"] = "error"

@auto_catalog_bp.post("/api/library/auto-download")
def start_auto_download():
    data = request.get_json(silent=True) or {}
    artist = str(data.get("artist", "")).strip()[:200]
    title = str(data.get("title", "")).strip()[:200]
    kind = data.get("kind")
    if not artist or not title or kind not in ("track", "release"):
        return jsonify({"error": "Informe artista, título e tipo."}), 400
    with BATCH_LOCK:
        if sum(x["status"] in ("searching", "downloading") for x in BATCHES.values()) >= 3:
            return jsonify({"error": "Aguarde os downloads em andamento."}), 429
        batch_id = uuid.uuid4().hex
        BATCHES[batch_id] = {"id": batch_id, "status": "searching", "total": 0, "completed": 0, "errors": [], "current_job": None, "current_title": None}
    threading.Thread(target=run_batch, args=(batch_id, artist, title, kind), daemon=True).start()
    return jsonify({"id": batch_id}), 202

@auto_catalog_bp.get("/api/library/auto-download/<batch_id>")
def get_auto_download(batch_id: str):
    with BATCH_LOCK:
        exists = batch_id in BATCHES
    return (jsonify(snapshot(batch_id)), 200) if exists else (jsonify({"error": "Transferência não encontrada."}), 404)

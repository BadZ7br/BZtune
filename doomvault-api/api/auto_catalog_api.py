"""BZtune auto catalog: preserva a identidade de origem do álbum.

O worker de áudio e as rotas de download existentes continuam os mesmos.
"""
from __future__ import annotations

import threading
import time
import uuid
import unicodedata
from flask import Blueprint, jsonify, request
from ytmusicapi import YTMusic
from api.downloads_api import JOBS, LOCK, MAX_CONCURRENT
from services.ytdlp_worker import enqueue_ytdlp
from services.catalog_album_link import verified_release, album_for_track, associate_release, VIDEO_ID

auto_catalog_bp = Blueprint("doomvault_auto_catalog", __name__)
BATCHES: dict[str, dict] = {}
BATCH_LOCK = threading.Lock()


def normalized(s: str) -> str:
    return " ".join("".join(c for c in unicodedata.normalize("NFKD", str(s).lower()) if not unicodedata.combining(c)).split())


def artist_match(row: dict, artist: str) -> bool:
    names = [a.get("name", "") for a in row.get("artists", []) if isinstance(a, dict)]
    return any(normalized(n) == normalized(artist) for n in names)



def _metadata_matches_song(yt, artist: str, title: str, video_id: str) -> bool:
    """Confere vídeo por ID sem depender exclusivamente do ranqueamento de busca.

    Em algumas músicas o search(songs) não devolve a mesma gravação apesar do ID
    estar correto. get_song só vale quando título E autor correspondem; a checagem
    não remove restrições de reprodução impostas pelo YouTube.
    """
    try:
        details = yt.get_song(video_id)
    except Exception:
        return False
    if not isinstance(details, dict):
        return False
    status = details.get("playabilityStatus") or {}
    if isinstance(status, dict) and status.get("status") in (
        "LOGIN_REQUIRED", "AGE_VERIFICATION_REQUIRED", "UNPLAYABLE", "ERROR"
    ):
        return False
    row = details.get("videoDetails") or {}
    if not isinstance(row,dict) or row.get("videoId") != video_id:
        return False
    found_title = normalized(row.get("title", ""))
    found_author = normalized(row.get("author", ""))
    expected_title = normalized(title)
    expected_artist = normalized(artist)
    # Algumas páginas usam o sufixo ' - Topic' para o canal oficial.
    if found_author.endswith(" topic"):
        found_author = found_author[:-6].strip(" -")
    return bool(expected_title and expected_artist) and (
        found_title == expected_title and found_author == expected_artist
    )


def resolve(artist: str, title: str, kind: str, album_id: str | None = None,
            video_id: str | None = None) -> tuple[list[dict], dict | None]:
    yt = YTMusic()
    if kind == "release":
        if not album_id:
            results = yt.search(f"{artist} {title}", filter="albums", limit=30)
            matching = [x for x in results if normalized(x.get("title", "")) == normalized(title)
                        and artist_match(x, artist) and x.get("browseId")]
            unique_ids = list(dict.fromkeys(x["browseId"] for x in matching))
            if len(unique_ids) != 1:
                raise ValueError("Lançamento ambíguo: abra a página do álbum para baixar a edição correta.")
            album_id = unique_ids[0]
        release = verified_release(yt, album_id, artist, title)
        return ([{"title": t["title"], "artist": artist, "videoId": t["videoId"]}
                 for t in release["tracks"]], release)
    if video_id and not VIDEO_ID.fullmatch(video_id):
        raise ValueError("ID da música inválido.")
    if album_id:
        release = verified_release(yt, album_id, artist)
        matched = [t for t in release["tracks"] if t["videoId"] == video_id] if video_id else [
            t for t in release["tracks"] if normalized(t["title"]) == normalized(title)]
        if len(matched) != 1:
            raise ValueError("Não foi possível confirmar a faixa neste álbum.")
        item = matched[0]
        return [{"title": item["title"], "artist": artist, "videoId": item["videoId"]}], release
    if video_id:
        # Não tenta efetuar download quando a fonte sinaliza bloqueio de acesso.
        # Falha de rede ao consultar detalhes não autoriza download por si só:
        # a validação exata por busca ainda será obrigatória.
        try:
            details = yt.get_song(video_id)
            state = (details.get("playabilityStatus") or {}).get("status") if isinstance(details, dict) else None
            if state in ("AGE_VERIFICATION_REQUIRED", "LOGIN_REQUIRED", "UNPLAYABLE", "ERROR"):
                raise ValueError("Esta gravação não está disponível para download por restrição da origem.")
        except ValueError:
            raise
        except Exception:
            pass
        # O ID fornecido pela pesquisa precisa coincidir com artista e título.
        results = yt.search(f"{artist} {title}", filter="songs", limit=30)
        verified = [x for x in results if x.get("videoId") == video_id
                    and normalized(x.get("title", "")) == normalized(title)
                    and artist_match(x, artist)]
        if not verified and not _metadata_matches_song(yt,artist,title,video_id):
            raise ValueError("Não foi possível confirmar título, artista e ID desta gravação no catálogo. Nenhum download foi iniciado.")
        release = album_for_track(yt, artist, title, video_id)
        return [{"title": title, "artist": artist, "videoId": video_id}], release
    results = yt.search(f"{artist} {title}", filter="songs", limit=20)
    exact = [x for x in results if normalized(x.get("title", "")) == normalized(title)
             and artist_match(x, artist) and x.get("videoId")]
    if not exact:
        raise ValueError("Não encontrei a faixa exata no catálogo.")
    item = exact[0]
    return [{"title": item["title"], "artist": artist, "videoId": item["videoId"]}], album_for_track(
        yt, artist, title, item["videoId"])


def snapshot(batch_id: str):
    with BATCH_LOCK:
        state = dict(BATCHES[batch_id])
        state["errors"] = list(state["errors"])
        state["warnings"] = list(state.get("warnings") or [])
    with LOCK:
        job = dict(JOBS.get(state["current_job"], {})) if state.get("current_job") else {}
    state["current"] = {"status": job.get("status"), "downloaded": job.get("downloaded", 0),
                        "total": job.get("total"), "error": job.get("error")}
    return state


def run_batch(batch_id: str, artist: str, title: str, kind: str,
              album_id: str | None = None, video_id: str | None = None):
    try:
        items, release = resolve(artist, title, kind, album_id, video_id)
        with BATCH_LOCK:
            BATCHES[batch_id]["total"] = len(items)
            BATCHES[batch_id]["status"] = "downloading"
        for item in items:
            while True:
                try:
                    job = enqueue_ytdlp(f"https://www.youtube.com/watch?v={item['videoId']}",
                                        item["title"], item["artist"], JOBS, LOCK, MAX_CONCURRENT)
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
                # Worker pode já retornar complete quando a faixa está disponível.
                if status in ("complete", "error"):
                    break
            with BATCH_LOCK:
                if status == "complete":
                    BATCHES[batch_id]["completed"] += 1
                else:
                    BATCHES[batch_id]["errors"].append(f"{item['title']}: {failure or 'erro desconhecido'}")
            if status == "complete" and release:
                try:
                    result = associate_release(release, [item["videoId"]])
                    with BATCH_LOCK:
                        BATCHES[batch_id]["linked"] += result["assigned"]
                        BATCHES[batch_id]["skipped"] += result["skipped"]
                        if not result["matched"]:
                            BATCHES[batch_id]["warnings"].append(
                                f"Sem vínculo comprovado para {item['title']}; mantida sem álbum.")
                except Exception as exc:
                    with BATCH_LOCK:
                        BATCHES[batch_id]["warnings"].append(
                            f"Álbum da faixa {item['title']}: {str(exc)[:120]}")
        with BATCH_LOCK:
            state = BATCHES[batch_id]
            state["status"] = "complete" if not state["errors"] else ("partial" if state["completed"] else "error")
    except Exception as exc:
        with BATCH_LOCK:
            BATCHES[batch_id]["errors"].append(str(exc)[:300])
            BATCHES[batch_id]["status"] = "error"


@auto_catalog_bp.post("/api/library/auto-download")
def start_auto_download():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Informe um objeto JSON com artista, título e tipo."}), 400
    artist = data.get("artist")
    title = data.get("title")
    kind = data.get("kind")
    if (not all(isinstance(value, str) and value.strip() and len(value) <= 200
                for value in (artist, title)) or kind not in ("track", "release")):
        return jsonify({"error": "Informe artista, título e tipo."}), 400
    artist, title = artist.strip(), title.strip()
    album_id, video_id = data.get("albumId"), data.get("videoId")
    if album_id is not None and (not isinstance(album_id, str) or not album_id.strip()
                                 or len(album_id) > 200 or any(ord(char) < 32 for char in album_id)):
        return jsonify({"error": "Identificador de álbum inválido."}), 400
    if video_id is not None and (not isinstance(video_id, str) or not VIDEO_ID.fullmatch(video_id)):
        return jsonify({"error": "Identificador de gravação inválido."}), 400
    with BATCH_LOCK:
        if sum(x["status"] in ("searching", "downloading") for x in BATCHES.values()) >= 3:
            return jsonify({"error": "Aguarde os downloads em andamento."}), 429
        batch_id = uuid.uuid4().hex
        BATCHES[batch_id] = {"id": batch_id, "status": "searching", "total": 0,
                             "completed": 0, "errors": [], "warnings": [], "linked": 0, "skipped": 0,
                             "current_job": None, "current_title": None}
    threading.Thread(target=run_batch, args=(batch_id, artist, title, kind, album_id, video_id), daemon=True).start()
    return jsonify({"id": batch_id}), 202


@auto_catalog_bp.get("/api/library/auto-download/<batch_id>")
def get_auto_download(batch_id: str):
    with BATCH_LOCK:
        exists = batch_id in BATCHES
    return (jsonify(snapshot(batch_id)), 200) if exists else (jsonify({"error": "Transferência não encontrada."}), 404)


@auto_catalog_bp.post("/api/library/albums/reconcile")
def reconcile_existing_album():
    """Ação explícita: agrupa arquivos existentes pelo ID de origem, sem redownload."""
    data = request.get_json(silent=True) or {}
    album_id = data.get("albumId")
    artist = data.get("artist")
    title = data.get("title")
    if not all(isinstance(x, str) and x.strip() for x in (album_id, artist, title)):
        return jsonify({"error": "Informe ID, artista e título do álbum."}), 400
    try:
        release = verified_release(YTMusic(), album_id, artist, title)
        result = associate_release(release)
    except Exception as exc:
        return jsonify({"error": str(exc)[:240]}), 400
    return jsonify(result)

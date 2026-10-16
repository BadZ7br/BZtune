"""Fila do catálogo DoomVault (arquivos com fonte autorizada cadastrada).

Registro no app.py, depois de downloads_bp:
    from catalog_queue_api import catalog_queue_bp
    app.register_blueprint(catalog_queue_bp)

Não altera downloads_api.py nem ytdlp_worker.py.
A fila é transitória; as faixas concluídas permanecem no SQLite.
"""
from __future__ import annotations

import threading
import time
import uuid
from flask import Blueprint, jsonify, request

from downloads_api import JOBS, LOCK, enqueue_download, match_sources
from ytdlp_worker import enqueue_ytdlp

catalog_queue_bp = Blueprint("doomvault_catalog_queue", __name__)
BATCHES: dict[str, dict] = {}
BATCH_LOCK = threading.Lock()
MAX_BATCH_ITEMS = 40
MAX_BATCHES = 100


def _snapshot(batch_id: str) -> dict | None:
    with BATCH_LOCK:
        batch = BATCHES.get(batch_id)
        if batch is None:
            return None
        items = [dict(x) for x in batch["items"]]
    with LOCK:
        jobs = {str(x["job_id"]): dict(JOBS.get(str(x["job_id"]), {}))
                for x in items if x.get("job_id")}
    for item in items:
        job = jobs.get(str(item.get("job_id")), {})
        if job:
            item["status"] = job.get("status", item["status"])
            item["downloaded"] = job.get("downloaded", 0)
            item["total"] = job.get("total")
            item["duplicate"] = bool(job.get("duplicate"))
            item["error"] = job.get("error")
    done = sum(x["status"] == "complete" for x in items)
    failed = sum(x["status"] == "error" for x in items)
    busy = sum(x["status"] in ("queued", "pending", "downloading", "processing") for x in items)
    return {"id": batch_id, "total": len(items), "completed": done,
            "failed": failed, "remaining": busy, "finished": busy == 0,
            "items": items}


def _run_batch(batch_id: str, sources: list[dict]):
    for index, source in enumerate(sources):
        # Processa um item por vez; nunca tenta enfileirar um álbum inteiro
        # contra o limite MAX_CONCURRENT do gerenciador existente.
        while True:
            try:
                if source.get("engine") == "yt-dlp":
                    job = enqueue_ytdlp(source["url"], source["title"][:200],
                                        source["artist"][:200], JOBS, LOCK, 2)
                else:
                    job = enqueue_download(source["url"], source["title"][:200],
                                           source["artist"][:200])
                break
            except RuntimeError as exc:
                if "simultân" in str(exc).lower() or "limite" in str(exc).lower():
                    time.sleep(1)
                    continue
                job = None
                error = str(exc)
                break
            except ValueError as exc:
                job = None
                error = str(exc)
                break
            except Exception as exc:
                job = None
                error = f"Falha ao iniciar: {type(exc).__name__}"
                break
        with BATCH_LOCK:
            item = BATCHES[batch_id]["items"][index]
            if job is None:
                item.update(status="error", error=error[:260])
                continue
            item.update(status="pending", job_id=job["id"])
        # Apenas inicia o próximo quando este terminar (inclui conversão).
        while True:
            with LOCK:
                status = JOBS.get(job["id"], {}).get("status", "error")
            if status in ("complete", "error"):
                break
            time.sleep(0.8)


@catalog_queue_bp.post("/api/library/catalog/queue")
def start_batch():
    payload = request.get_json(silent=True) or {}
    artist = str(payload.get("artist") or "").strip()[:200]
    title = str(payload.get("title") or "").strip()[:200]
    kind = payload.get("kind")
    if not artist or not title or kind not in ("track", "release"):
        return jsonify({"error": "Informe artista, título e tipo válido."}), 400
    sources = match_sources(artist, title, kind)
    if not sources:
        return jsonify({"error": "Não há fonte de download cadastrada para este item."}), 404
    if len(sources) > MAX_BATCH_ITEMS:
        return jsonify({"error": "O lançamento excede o limite de 40 faixas por lote."}), 400
    with BATCH_LOCK:
        if len(BATCHES) >= MAX_BATCHES:
            # remove apenas lotes terminados, sem interromper transferências
            complete_ids = [bid for bid in BATCHES if (_is_batch_finished_unlocked(bid))]
            for bid in complete_ids[:max(1, len(BATCHES) - MAX_BATCHES + 1)]:
                BATCHES.pop(bid, None)
        if len(BATCHES) >= MAX_BATCHES:
            return jsonify({"error": "Muitas filas ativas; aguarde concluir uma transferência."}), 429
        batch_id = uuid.uuid4().hex
        BATCHES[batch_id] = {"items": [
            {"title": s["title"], "artist": s["artist"], "status": "queued", "job_id": None,
             "downloaded": 0, "total": None, "error": None, "duplicate": False}
            for s in sources
        ]}
    threading.Thread(target=_run_batch, args=(batch_id, sources), daemon=True).start()
    return jsonify({"batch": _snapshot(batch_id)}), 202


def _is_batch_finished_unlocked(batch_id: str) -> bool:
    # Chamada dentro de BATCH_LOCK: não adquire bloqueios adicionais.
    return all(item["status"] == "error" or (
        item.get("job_id") is not None and
        JOBS.get(item["job_id"], {}).get("status") in ("complete", "error")
    ) for item in BATCHES[batch_id]["items"])


@catalog_queue_bp.get("/api/library/catalog/queue/<batch_id>")
def batch_status(batch_id: str):
    batch = _snapshot(batch_id)
    if batch is None:
        return jsonify({"error": "Fila não encontrada (o Flask pode ter reiniciado)."}), 404
    return jsonify({"batch": batch})

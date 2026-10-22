"""Read-only LRCLIB integration. No credentials or media files are sent."""
import json
import math
import time
import uuid
from email.utils import parsedate_to_datetime
from flask import Blueprint, jsonify, request
import httpx
from services.lyrics_transport import (LyricsBusy, LyricsCancelled, cancel_job,
    fetch_lyrics_response, finish_job, start_job, valid_request_id)

lyrics_bp = Blueprint("lyrics", __name__)


@lyrics_bp.post("/api/lyrics/cancel/<identifier>")
def cancel_lyrics(identifier):
    if not valid_request_id(identifier):
        return jsonify(error="Identificador de busca inválido."), 400
    cancel_job(identifier)
    return "", 204


def retry_after_seconds(value):
    """Normalize Retry-After delta-seconds or an HTTP date; default to one minute."""
    if not isinstance(value, str) or len(value) > 100:
        return 60
    try:
        value = value.strip()
        if value.isascii() and value.isdigit():
            seconds = int(value)
        else:
            date = parsedate_to_datetime(value)
            if date.tzinfo is None:
                return 60
            seconds = max(0, math.ceil(date.timestamp() - time.time()))
        return seconds if 0 <= seconds <= 2_147_483_647 else 60
    except (ValueError, TypeError, OverflowError):
        return 60


@lyrics_bp.get("/api/lyrics/search")
@lyrics_bp.get("/api/lyrics")
def get_lyrics():
    searching = request.path.endswith("/search")
    params = {}
    for name in ("track_name", "artist_name", "album_name"):
        value = request.args.get(name, "").strip()
        if len(value) > 300 or (name != "album_name" and not value):
            return jsonify(error="Informe título e artista válidos (até 300 caracteres)."), 400
        if value:
            params[name] = value
    if request.args.get("duration") and not searching:
        try:
            seconds = float(request.args["duration"])
            if not math.isfinite(seconds) or not 1 <= seconds <= 3600:
                raise ValueError()
            params["duration"] = seconds
        except ValueError:
            return jsonify(error="Duração inválida."), 400
    if searching:
        params.pop("album_name", None)
    identifier = request.args.get("request_id", str(uuid.uuid4()))
    if not valid_request_id(identifier):
        return jsonify(error="Identificador de busca inválido."), 400
    try:
        budget_ms = int(request.args.get("timeout_ms", "15000"))
        if not 1 <= budget_ms <= 15000:
            raise ValueError()
    except ValueError:
        return jsonify(error="Prazo de busca inválido."), 400
    response = None
    job = None
    try:
        job = start_job(identifier, budget_ms / 1000)
        response = fetch_lyrics_response(
            "https://lrclib.net/api/search" if searching else "https://lrclib.net/api/get", params=params,
            headers={"User-Agent": "BZtune (https://github.com/BadZ7br/BZtune)", "Accept": "application/json"},
            job=job,
        )
        if response.status_code == 404:
            return jsonify(error="Nenhuma letra encontrada no LRCLIB para esta gravação."), 404
        if response.status_code == 429:
            seconds = retry_after_seconds(response.headers.get("Retry-After"))
            result = jsonify(error=f"O LRCLIB limitou as consultas. Aguarde {seconds} segundos antes de tentar novamente.",
                             code="LRCLIB_RATE_LIMITED", retry_after_seconds=seconds)
            result.status_code = 429
            result.headers["Retry-After"] = str(seconds)
            return result
        if response.status_code != 200:
            return jsonify(error="O LRCLIB está indisponível. Tente novamente mais tarde."), 502
        # Limit actual decompressed bytes before parsing JSON, even without Content-Length.
        chunks = []
        size = 0
        for chunk in response.iter_bytes(chunk_size=16_384):
            size += len(chunk)
            if size > 1_048_576:
                raise ValueError("LRCLIB response too large")
            chunks.append(chunk)
        data = json.loads(b"".join(chunks))
        if searching:
            if not isinstance(data, list) or len(data) > 100:
                raise ValueError()
            candidates = []
            seen = set()
            for item in data:
                try:
                    candidate = normalize_candidate(item)
                except ValueError:
                    # One incomplete recording must not discard the other results.
                    continue
                if candidate is not None and candidate["id"] not in seen:
                    seen.add(candidate["id"])
                    candidates.append(candidate)
            return jsonify(candidates=candidates)
        result = normalize_lyrics(data)
        if not result["instrumental"] and not any(result[k].strip() for k in ("syncedLyrics", "plainLyrics")):
            return jsonify(error="O LRCLIB não possui letra para esta gravação."), 404
        return jsonify(result)
    except LyricsCancelled:
        return jsonify(error="Busca de letra cancelada.", code="LYRICS_CANCELLED"), 409
    except LyricsBusy:
        return jsonify(error="Há consultas de letras em andamento. Tente novamente em instantes.", code="LYRICS_BUSY"), 503
    except (httpx.TimeoutException, TimeoutError):
        return jsonify(error="O LRCLIB demorou para responder. Tente novamente."), 504
    except (httpx.HTTPError, ValueError):
        return jsonify(error="Não foi possível consultar o LRCLIB."), 502

    finally:
        if response is not None:
            response.close()
        if job is not None:
            finish_job(job)


def normalize_lyrics(data):
    if not isinstance(data, dict):
        raise ValueError()
    result = {"source": "LRCLIB", "instrumental": data.get("instrumental") is True}
    for field in ("syncedLyrics", "plainLyrics"):
        text = data.get(field)
        if text is not None and (not isinstance(text, str) or len(text.encode("utf-8")) > 250_000):
            raise ValueError()
        result[field] = text or ""
    return result


def normalize_candidate(data):
    result = normalize_lyrics(data)
    identifier = data.get("id")
    duration = data.get("duration")
    if type(identifier) is not int or not 1 <= identifier <= 9_007_199_254_740_991:
        raise ValueError()
    if duration is not None and (type(duration) not in (float, int)
            or not 0 <= duration <= 86400 or not math.isfinite(duration)):
        raise ValueError()
    for field in ("trackName", "artistName", "albumName"):
        text = data.get(field, "")
        if field == "albumName" and (text is None or isinstance(text, str) and text.strip().lower() in ("null", "none")):
            text = ""
        if not isinstance(text, str) or len(text) > 1000:
            raise ValueError()
        result[field] = text
    if not result["trackName"].strip() or not result["artistName"].strip():
        raise ValueError()
    if not result["instrumental"] and not any(result[k].strip() for k in ("syncedLyrics", "plainLyrics")):
        return None
    return dict(result, id=identifier, duration=duration)

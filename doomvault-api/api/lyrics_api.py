"""Read-only LRCLIB integration. No credentials or media files are sent."""
import json
import math
from flask import Blueprint, jsonify, request
import requests

lyrics_bp = Blueprint("lyrics", __name__)


@lyrics_bp.get("/api/lyrics")
def get_lyrics():
    params = {}
    for name in ("track_name", "artist_name", "album_name"):
        value = request.args.get(name, "").strip()
        if len(value) > 300 or (name != "album_name" and not value):
            return jsonify(error="Informe título e artista válidos (até 300 caracteres)."), 400
        if value:
            params[name] = value
    if request.args.get("duration"):
        try:
            seconds = float(request.args["duration"])
            if not math.isfinite(seconds) or not 1 <= seconds <= 3600:
                raise ValueError()
            params["duration"] = seconds
        except ValueError:
            return jsonify(error="Duração inválida."), 400
    response = None
    try:
        response = requests.get(
            "https://lrclib.net/api/get", params=params,
            headers={"User-Agent": "BZtune (https://github.com/BadZ7br/BZtune)", "Accept": "application/json"},
            timeout=(4, 12), allow_redirects=False, stream=True,
        )
        if response.status_code == 404:
            return jsonify(error="Nenhuma letra encontrada no LRCLIB para esta gravação."), 404
        if response.status_code != 200:
            return jsonify(error="O LRCLIB está indisponível. Tente novamente mais tarde."), 502
        # Limit actual decompressed bytes before parsing JSON, even without Content-Length.
        chunks = []
        size = 0
        for chunk in response.iter_content(chunk_size=16_384):
            size += len(chunk)
            if size > 1_048_576:
                raise ValueError("LRCLIB response too large")
            chunks.append(chunk)
        data = json.loads(b"".join(chunks))
        if not isinstance(data, dict):
            raise ValueError()
        result = {"source": "LRCLIB", "instrumental": data.get("instrumental") is True}
        for field in ("syncedLyrics", "plainLyrics"):
            text = data.get(field)
            if text is not None and (not isinstance(text, str) or len(text.encode("utf-8")) > 250_000):
                raise ValueError()
            result[field] = text or ""
        if not result["instrumental"] and not any(result[k].strip() for k in ("syncedLyrics", "plainLyrics")):
            return jsonify(error="O LRCLIB não possui letra para esta gravação."), 404
        return jsonify(result)
    except requests.Timeout:
        return jsonify(error="O LRCLIB demorou para responder. Tente novamente."), 504
    except (requests.RequestException, ValueError):
        return jsonify(error="Não foi possível consultar o LRCLIB."), 502

    finally:
        if response is not None:
            response.close()

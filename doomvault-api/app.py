
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from ytmusicapi import YTMusic
from rapidfuzz import fuzz, process
import re
import io
import hashlib
from pathlib import Path
from urllib.parse import urlparse, urljoin
import requests
import time
from threading import Lock
from library_api import library_bp
from downloads_api import downloads_bp
from typing import Literal, cast
from catalog_queue_api import catalog_queue_bp
from auto_catalog_api import auto_catalog_bp
from playlists_api import playlists_bp

SearchFilter = Literal["artists", "albums", "songs"]


# Cache em memória para evitar consultas repetidas à MusicBrainz.
_mb_cache = {}
_mb_lock = Lock()
_mb_request_lock = Lock()
_last_mb_request = [0.0]
_MB_HEADERS = {"User-Agent": "DoomVault/0.6 (local music explorer; development)"}


app = Flask(__name__)
CORS(app)
app.register_blueprint(library_bp)
app.register_blueprint(downloads_bp)
app.register_blueprint(catalog_queue_bp)
app.register_blueprint(auto_catalog_bp)
app.register_blueprint(playlists_bp)

yt = YTMusic()

def _musicbrainz_json(url, params, ttl=14400):
    # Usa a URL e os parâmetros como chave, sem cadastrar nenhum gênero.
    key = (url, tuple(sorted(params.items())))
    now = time.monotonic()
    with _mb_lock:
        cached = _mb_cache.get(key)
        if cached and cached[0] > now:
            return cached[1]

    for attempt in range(2):
        try:
            # MusicBrainz recomenda limitar a frequência das consultas.
            with _mb_request_lock:
                wait = 1.1 - (time.monotonic() - _last_mb_request[0])
                if wait > 0:
                    time.sleep(wait)
                _last_mb_request[0] = time.monotonic()
                response = requests.get(
                    url, params=params, headers=_MB_HEADERS, timeout=(4, 10)
                )
            if response.status_code in (429, 502, 503, 504) and attempt == 0:
                # MusicBrainz pode limitar requisições; respeita um breve intervalo.
                wait = response.headers.get("Retry-After", "1")
                try:
                    wait_seconds = min(3.0, max(1.0, float(wait)))
                except ValueError:
                    wait_seconds = 1.0
                time.sleep(wait_seconds)
                continue
            response.raise_for_status()
            data = response.json()
            with _mb_lock:
                _mb_cache[key] = (time.monotonic() + ttl, data)
            return data
        except (requests.Timeout, requests.ConnectionError):
            if attempt == 0:
                time.sleep(1.0)
                continue
            raise
    raise requests.RequestException("MusicBrainz indisponível")


def remove_repeated_letters(text):
    # Exemplo:
    # "electric wwiizzaarrdd" -> "electric wizard"
    return re.sub(r"([a-zA-Z])\1+", r"\1", text)


def find_correct_artist(query):
    # Primeiro tenta a pesquisa original.
    candidates = [query]

    # Depois tenta remover letras repetidas.
    simplified = remove_repeated_letters(query)

    if simplified.lower() != query.lower():
        candidates.append(simplified)

    for candidate in candidates:
        results = yt.search(
            candidate,
            filter="artists",
            limit=20,
        )

        names = [
            item.get("artist")
            for item in results
            if item.get("artist")
        ]

        if not names:
            continue

        match = process.extractOne(
            candidate,
            names,
            scorer=fuzz.WRatio,
        )

        if match and match[1] >= 80:
            return match[0]

    return None


def normalize(text):
    return "".join(
        char.lower()
        for char in text
        if char.isalnum()
    )


@app.get("/")
def home():
    return jsonify({
        "app": "DoomVault API",
        "status": "online",
    })


@app.get("/api/albums")
def search_albums():
    query = request.args.get("q", "").strip()
    artist_filter = request.args.get("artist", "").strip()

    if not query:
        return jsonify({
            "error": "Informe o parâmetro q."
        }), 400

    try:
        # Pesquisa o texto digitado originalmente.
        results = yt.search(
            query,
            filter="albums",
            limit=25,
        )

        corrected = None

        # Verifica se a consulta tem letras repetidas.
        # A função de correção já foi criada anteriormente.
        simplified = remove_repeated_letters(query)

        if normalize(simplified) != normalize(query):
            possible_artist = find_correct_artist(query)

            # Só corrige se encontrou um nome diferente.
            if (
                possible_artist
                and normalize(possible_artist) != normalize(query)
            ):
                corrected = possible_artist

                # Refaz a pesquisa pelo artista identificado.
                results = yt.search(
                    corrected,
                    filter="albums",
                    limit=50,
                )

                artist_filter = corrected

        albums = []

        for item in results:
            title = item.get("title", "")
            artists = item.get("artists", [])

            artist_names = [
                artist.get("name", "")
                for artist in artists
            ]

            if artist_filter:
                if normalize(artist_filter) not in [
                    normalize(name) for name in artist_names
                ]:
                    continue

            thumbnails = item.get("thumbnails", [])

            albums.append({
                "title": title,
                "artist": ", ".join(artist_names),
                "artist_id": (artists[0].get("id") if artists else None),
                "year": item.get("year"),
                "id": item.get("browseId"),
                "cover": (
                    thumbnails[-1]["url"]
                    if thumbnails
                    else None
                ),
            })

        return jsonify({
            "query": query,
            "corrected": corrected,
            "count": len(albums),
            "results": albums,
        })

    except Exception:
        app.logger.exception("Falha na pesquisa")

        return jsonify({
            "error": "Não foi possível consultar o YouTube Music."
        }), 502


@app.get("/api/artists")
def search_artists():
    query = request.args.get("q", "").strip()

    if not query:
        return jsonify({
            "error": "Informe o parâmetro q."
        }), 400

    try:
        results = yt.search(
            query,
            filter="artists",
            limit=20,
        )

        artists = []

        for item in results:
            thumbnails = item.get("thumbnails", [])

            artists.append({
                "name": item.get("artist", item.get("title")),
                "id": item.get("browseId"),
                "subscribers": item.get("subscribers"),
                "description": item.get("description"),
                "image": (
                    thumbnails[-1]["url"]
                    if thumbnails
                    else None
                ),
            })

        return jsonify({
            "query": query,
            "count": len(artists),
            "results": artists,
        })

    except Exception as error:
        app.logger.exception("Falha na busca de artistas")

        return jsonify({
            "error": "Não foi possível pesquisar artistas.",
            "details": str(error),
        }), 502


@app.get("/api/artists/<artist_id>/albums")
def artist_discography(artist_id):
    artist_name = request.args.get("name", "").strip()

    if not artist_name:
        return jsonify({
            "error": "Informe o nome do artista.",
            "example": (
                "/api/artists/" + artist_id +
                "/albums?name=Electric%20Wizard"
            )
        }), 400

    try:
        albums = []
        seen_ids = set()
        warnings = []
        artist_songs = []

        def append_releases(results, section_name):
            for release in results:
                release_id = release.get("browseId")
                if not release_id or release_id in seen_ids:
                    continue
                seen_ids.add(release_id)
                thumbnails = release.get("thumbnails", [])
                release_artists = release.get("artists") or []
                names = [item.get("name", "") for item in release_artists if item.get("name")]
                albums.append({
                    "id": release_id,
                    "title": release.get("title"),
                    "artist": ", ".join(names) or artist_name,
                    "artist_id": artist_id,
                    "year": release.get("year"),
                    "cover": thumbnails[-1].get("url") if thumbnails else None,
                    "release_type": release.get("type") or section_name,
                })

        if artist_id != "lookup":
            profile = yt.get_artist(artist_id)
            artist_name = profile.get("name") or artist_name
            song_section = profile.get("songs") or {}
            for song in song_section.get("results", []) if isinstance(song_section, dict) else []:
                thumbnails = song.get("thumbnails") or []
                song_album = song.get("album")
                if isinstance(song_album, dict):
                    song_album = song_album.get("name")
                if not isinstance(song_album, str):
                    song_album = None
                song_artist = song.get("artist")
                if isinstance(song_artist, dict):
                    song_artist = song_artist.get("name")
                if not isinstance(song_artist, str):
                    song_artist = artist_name
                artist_songs.append({
                    "video_id": song.get("videoId"),
                    "title": song.get("title"),
                    "artist": song_artist or artist_name,
                    "album": song_album,
                    "duration": song.get("duration"),
                    "cover": thumbnails[-1].get("url") if thumbnails else None,
                })
            for section_name in ("albums", "singles", "shows"):
                section = profile.get(section_name) or {}
                if not isinstance(section, dict):
                    continue
                section_results = section.get("results") or []
                browse_id = section.get("browseId")
                params = section.get("params")
                if browse_id and params:
                    try:
                        section_results = yt.get_artist_albums(browse_id, params, limit=None)
                    except Exception as exc:
                        warnings.append(f"{section_name}: {type(exc).__name__}")
                append_releases(section_results, section_name[:-1] if section_name.endswith("s") else section_name)
        else:
            results = yt.search(artist_name, filter="albums", limit=100)
            for release in results:
                names = [item.get("name", "") for item in release.get("artists", [])]
                if not any(normalize(name) == normalize(artist_name) for name in names):
                    continue
                append_releases([release], release.get("type") or "release")

        albums.sort(
            key=lambda album: int(album["year"] or 0)
        )

        return jsonify({
            "artist": artist_name,
            "artist_id": artist_id,
            "count": len(albums),
            "albums": albums,
            "songs": artist_songs,
            "sections": {kind: sum(1 for item in albums if item["release_type"] == kind)
                         for kind in ("album", "single", "show", "release")},
            "warnings": warnings,
            "complete": artist_id != "lookup" and not warnings,
            "source": "YouTube Music artist profile" if artist_id != "lookup" else "YouTube Music search",
        })

    except Exception:
        app.logger.exception("Falha na discografia")

        return jsonify({
            "error": "Não foi possível buscar os álbuns."
        }), 502


@app.get("/api/albums/<album_id>")
def album_details(album_id):
    try:
        album = yt.get_album(album_id)

        thumbnails = album.get("thumbnails", [])
        artists = album.get("artists", [])

        tracks = []

        for index, track in enumerate(
            album.get("tracks", []), start=1
        ):
            track_artists = track.get("artists", [])

            tracks.append({
                "number": index,
                "title": track.get("title"),
                "video_id": track.get("videoId"),
                "duration": track.get("duration"),
                "duration_seconds": track.get(
                    "duration_seconds"
                ),
                "artists": [
                    artist.get("name")
                    for artist in track_artists
                ],
            })

        return jsonify({
            "id": album_id,
            "title": album.get("title"),
            "artists": [
                artist.get("name")
                for artist in artists
            ],
            "artist_ids": [artist.get("id") for artist in artists if artist.get("id")],
            "artist_id": artists[0].get("id") if artists else None,
            "year": album.get("year"),
            "description": album.get("description"),
            "cover": (
                thumbnails[-1]["url"]
                if thumbnails
                else None
            ),
            "track_count": len(tracks),
            "tracks": tracks,
        })

    except Exception:
        app.logger.exception("Erro ao carregar álbum")

        return jsonify({
            "error": "Não foi possível carregar o álbum."
        }), 502


@app.get("/api/correct")
def correct_search():
    query = request.args.get("q", "").strip()

    if not query:
        return jsonify({
            "error": "Informe uma pesquisa."
        }), 400

    try:
        corrected = find_correct_artist(query)

        return jsonify({
            "original": query,
            "corrected": corrected,
            "found": corrected is not None,
        })

    except Exception:
        app.logger.exception("Falha na correção")

        return jsonify({
            "error": "Não foi possível corrigir a pesquisa."
        }), 502


@app.get("/api/search")
def universal_search():
    query = request.args.get("q", "").strip()
    search_type = request.args.get("type", "all").lower()

    allowed = {
        "all", "artists", "albums", "songs"
    }

    if not query:
        return jsonify({
            "error": "Informe uma pesquisa."
        }), 400

    if search_type not in allowed:
        return jsonify({
            "error": "Tipo de pesquisa inválido."
        }), 400

    try:
        # Aproveita nosso corretor já existente.
        simplified = remove_repeated_letters(query)
        corrected = None
        search_query = query

        if normalize(simplified) != normalize(query):
            candidate = find_correct_artist(query)

            if candidate:
                search_query = candidate
                corrected = candidate

        types: list[SearchFilter] = (
            ["artists", "albums", "songs"]
            if search_type == "all"
            else [cast(SearchFilter, search_type)]
        )

        results = {
            "artists": [],
            "albums": [],
            "songs": [],
        }

        for kind in types:
            items = yt.search(
                search_query,
                filter=kind,
                limit=20,
            )

            for item in items:
                thumbnails = item.get("thumbnails") or []
                cover = (
                    thumbnails[-1].get("url")
                    if thumbnails
                    else None
                )

                if kind == "artists":
                    results["artists"].append({
                        "id": item.get("browseId"),
                        "name": item.get("artist")
                                or item.get("title"),
                        "image": cover,
                        "type": "artist",
                    })

                elif kind == "albums":
                    artists = item.get("artists") or []

                    names = [
                        a.get("name", "")
                        for a in artists
                    ]

                    if not names and item.get("artist"):
                        names = [item["artist"]]

                    results["albums"].append({
                        "id": item.get("browseId"),
                        "title": item.get("title"),
                        "artist": ", ".join(names),
                        "artist_id": artists[0].get("id") if artists else None,
                        "year": item.get("year"),
                        "cover": cover,
                        "release_type": item.get("type"),
                        "type": "album",
                    })

                elif kind == "songs":
                    artists = item.get("artists") or []

                    results["songs"].append({
                        "id": item.get("videoId"),
                        "title": item.get("title"),
                        "artist": ", ".join(
                            a.get("name", "")
                            for a in artists
                        ),
                        "album": (
                            (item.get("album") or {}).get("name")
                        ),
                        "duration": item.get("duration"),
                        "duration_seconds": item.get(
                            "duration_seconds"
                        ),
                        "cover": cover,
                        "type": "song",
                    })

        return jsonify({
            "query": query,
            "corrected": corrected,
            "results": results,
            "counts": {
                key: len(value)
                for key, value in results.items()
            },
        })

    except Exception:
        app.logger.exception("Falha na pesquisa universal")

        return jsonify({
            "error": "Não foi possível realizar a pesquisa."
        }), 502



# Proxy controlado para capas com cache em disco.
CACHE_DIR = Path(__file__).resolve().parent / "cover_cache"
CACHE_DIR.mkdir(exist_ok=True)


def trusted_cover_url(url):
    parts = urlparse(url)
    host = (parts.hostname or "").lower()
    domains = ("googleusercontent.com", "mzstatic.com", "coverartarchive.org", "archive.org")
    return (parts.scheme == "https" and not parts.username and not parts.password
            and parts.port in (None, 443)
            and any(host == d or host.endswith("." + d) for d in domains))


def fetch_cover(url):
    for _ in range(4):
        if not trusted_cover_url(url):
            return None
        with requests.get(url, stream=True, timeout=(4, 9), allow_redirects=False) as response:
            if response.status_code in (301, 302, 303, 307, 308):
                url = urljoin(url, response.headers.get("Location", ""))
                continue
            if response.status_code != 200:
                return None
            mime = response.headers.get("Content-Type", "").split(";")[0].lower()
            if mime not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
                return None
            chunks, size = [], 0
            for chunk in response.iter_content(65536):
                size += len(chunk)
                if size > 5 * 1024 * 1024:
                    return None
                chunks.append(chunk)
            data = b"".join(chunks)
            good = (data.startswith(bytes.fromhex("ffd8ff")) or
                    data.startswith(bytes.fromhex("89504e470d0a1a0a")) or
                    (data.startswith(b"RIFF") and data[8:12] == b"WEBP") or
                    data.startswith((b"GIF87a", b"GIF89a")))
            return (data, mime) if good else None
    return None


def backup_covers(title, artist):
    if not title or not artist:
        return []
    try:
        response = requests.get("https://itunes.apple.com/search", params={
            "term": f"{title} {artist}", "entity": "album", "limit": 50}, timeout=9)
        response.raise_for_status()
        matches = [v for v in response.json().get("results", [])
                   if normalize(v.get("collectionName", "")) == normalize(title)
                   and normalize(v.get("artistName", "")) == normalize(artist)]
        return [v["artworkUrl100"].replace("100x100bb", "600x600bb")
                for v in matches if v.get("artworkUrl100")]
    except (requests.RequestException, ValueError):
        return []


@app.get("/api/cover")
def cover_proxy():
    original = request.args.get("url", "")
    title = request.args.get("title", "")[:180]
    artist = request.args.get("artist", "")[:180]
    if len(original) > 2048 or (original and not trusted_cover_url(original)):
        return jsonify({"error": "URL não permitida"}), 400
    key = hashlib.sha256(f"{original}|{title}|{artist}".encode()).hexdigest()
    path = CACHE_DIR / (key + ".img")
    mimepath = CACHE_DIR / (key + ".mime")
    if path.exists() and mimepath.exists():
        return send_file(path, mimetype=mimepath.read_text(), max_age=86400)
    # Primeiro tenta o YouTube Music; consulta iTunes apenas se necessário.
    candidates = [original] if original else []
    for candidate in candidates:
        try:
            found = fetch_cover(candidate)
        except (requests.RequestException, ValueError):
            found = None
        if found:
            data, mime = found
            path.write_bytes(data)
            mimepath.write_text(mime)
            return send_file(io.BytesIO(data), mimetype=mime, max_age=86400)
    for candidate in backup_covers(title, artist):
        try:
            found = fetch_cover(candidate)
        except (requests.RequestException, ValueError):
            found = None
        if found:
            data, mime = found
            path.write_bytes(data)
            mimepath.write_text(mime)
            return send_file(io.BytesIO(data), mimetype=mime, max_age=86400)
    return jsonify({"error": "Capa indisponível"}), 404


# Lista integral de nomes: o MusicBrainz oferece fmt=txt sem paginação.
# Os IDs são resolvidos somente quando o usuário abre um gênero.
_genre_index_cache = {"expires": 0.0, "names": []}
_genre_index_lock = Lock()


def _genre_names():
    now = time.monotonic()
    with _genre_index_lock:
        if _genre_index_cache["names"] and now < _genre_index_cache["expires"]:
            return _genre_index_cache["names"]

    for attempt in range(2):
        try:
            with _mb_request_lock:
                wait = 1.1 - (time.monotonic() - _last_mb_request[0])
                if wait > 0:
                    time.sleep(wait)
                _last_mb_request[0] = time.monotonic()
                response = requests.get(
                    "https://musicbrainz.org/ws/2/genre/all",
                    params={"fmt": "txt"}, headers=_MB_HEADERS,
                    timeout=(5, 15),
                )
            if response.status_code in (429, 502, 503, 504) and attempt == 0:
                time.sleep(2)
                continue
            response.raise_for_status()
            names = [name.strip() for name in response.text.splitlines() if name.strip()]
            if not names:
                raise ValueError("MusicBrainz retornou uma lista vazia")
            with _genre_index_lock:
                _genre_index_cache["names"] = names
                _genre_index_cache["expires"] = time.monotonic() + 86400
            return names
        except (requests.Timeout, requests.ConnectionError):
            if attempt == 0:
                time.sleep(1)
                continue
            raise
    raise requests.RequestException("Não foi possível listar os gêneros")


@app.get("/api/genres/index")
def genres_index():
    try:
        names = _genre_names()
        return jsonify({"count": len(names), "genres": names})
    except (requests.RequestException, ValueError):
        app.logger.exception("Falha no índice global de gêneros")
        return jsonify({"error": "Não foi possível carregar o índice de gêneros."}), 502


@app.get("/api/genres/resolve")
def resolve_genre():
    try:
        index = int(request.args.get("index", "-1"))
        names = _genre_names()
        if index < 0 or index >= len(names):
            return jsonify({"error": "Índice de gênero inválido."}), 400
        expected_name = names[index]
        page_offset = (index // 100) * 100
        payload = _musicbrainz_json(
            "https://musicbrainz.org/ws/2/genre/all",
            {"fmt": "json", "limit": 100, "offset": page_offset},
            ttl=86400,
        )
        genres = payload.get("genres", [])
        item = next((g for g in genres if g.get("name") == expected_name), None)
        if item is None:
            return jsonify({"error": "Não foi possível identificar este gênero."}), 404
        return jsonify({"id": item["id"], "name": item["name"]})
    except (requests.RequestException, ValueError, KeyError):
        app.logger.exception("Falha ao resolver gênero")
        return jsonify({"error": "Não foi possível abrir este gênero."}), 502


@app.get("/api/genres")
def genres_dynamic():
    try:
        offset = max(0, int(request.args.get("offset", "0")))
        limit = min(100, max(1, int(request.args.get("limit", "100"))))
        payload = _musicbrainz_json(
            "https://musicbrainz.org/ws/2/genre/all",
            {"fmt": "json", "limit": limit, "offset": offset},
            ttl=86400,
        )
        found = [
            {"id": g["id"], "name": g["name"]}
            for g in payload.get("genres", [])
            if g.get("id") and g.get("name")
        ]
        return jsonify({
            "genres": found,
            "count": payload.get("genre-count", len(found)),
            "offset": offset,
            "next_offset": offset + len(found) if found else None,
        })
    except (requests.RequestException, ValueError):
        app.logger.exception("Erro ao consultar gêneros")
        return jsonify({"error": "Não foi possível consultar gêneros."}), 502


@app.get("/api/genres/<genre_id>/artists")
def genre_artists(genre_id):
    """Artistas associados à tag do gênero; lista colaborativa e parcial."""
    import uuid
    try:
        uuid.UUID(genre_id)
        offset = max(0, int(request.args.get("offset", "0")))
        limit = min(25, max(1, int(request.args.get("limit", "12"))))
    except ValueError:
        return jsonify({"error": "Parâmetro inválido."}), 400

    name = request.args.get("name", "").strip()[:100]
    if not name:
        return jsonify({"error": "Informe o nome do gênero."}), 400

    try:
        safe_name = name.replace('"', " ")
        data = _musicbrainz_json(
            "https://musicbrainz.org/ws/2/artist/",
            {"query": f'tag:"{safe_name}"', "fmt": "json", "limit": limit, "offset": offset},
            ttl=14400,
        )
        entries = [
            {"id": item.get("id"), "name": item.get("name"), "score": item.get("score")}
            for item in data.get("artists", []) if item.get("name")
        ]
        return jsonify({
            "genre": name, "genre_id": genre_id, "artists": entries,
            "count": data.get("count", len(entries)), "offset": offset,
        })
    except (requests.RequestException, ValueError):
        app.logger.exception("Erro buscando artistas do gênero")
        return jsonify({"error": "Não foi possível carregar artistas deste gênero."}), 502


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True,
    )


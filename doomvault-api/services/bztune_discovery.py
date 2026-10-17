"""Discovery v1.5: adaptação leve sobre o YouTube Music público (ytmusicapi).
Não faz download e não grava histórico fora do dispositivo.
"""
from __future__ import annotations

import re
import threading
import time
from typing import Any

_CACHE: dict[tuple, tuple[float, dict[str, Any]]] = {}
_LOCK = threading.Lock()
_CLIENT: Any = None
_MOODS = {
    "melancolico": "melancholic", "sombrio": "dark atmospheric",
    "relaxante": "relaxing", "energetico": "energetic",
    "psicodelico": "psychedelic", "instrumental": "instrumental",
}


def _yt():
    global _CLIENT
    if _CLIENT is None:
        from ytmusicapi import YTMusic
        _CLIENT = YTMusic()
    return _CLIENT


def _remember(key: tuple, fn, ttl: int = 900) -> dict:
    now = time.monotonic()
    with _LOCK:
        item = _CACHE.get(key)
        if item and item[0] > now:
            return item[1]
    result = fn()
    with _LOCK:
        if len(_CACHE) > 250:
            _CACHE.clear()
        _CACHE[key] = (time.monotonic() + ttl, result)
    return result


def _artist(value: Any) -> str:
    if isinstance(value, str):
        return value
    if not isinstance(value, list):
        return ""
    return ", ".join(x.get("name", "") for x in value if isinstance(x, dict) and x.get("name"))


def _cover(row: dict) -> str | None:
    thumbs = row.get("thumbnails") or []
    for t in reversed(thumbs):
        if isinstance(t, dict) and str(t.get("url") or "").startswith("https://"):
            return t["url"]
    return None


def _song(row: dict) -> dict | None:
    video_id = row.get("videoId")
    if not isinstance(video_id, str) or not re.fullmatch(r"[\w-]{11}", video_id):
        return None
    return {"videoId": video_id,"title":str(row.get("title") or "Faixa sem título")[:200],
            "artist":_artist(row.get("artists")) or str(row.get("artist") or "Desconhecido"),
            "album":str((row.get("album") or {}).get("name") or "") if isinstance(row.get("album"),dict) else "",
            "cover":_cover(row),"duration":row.get("duration")}


def _album(row: dict) -> dict | None:
    album_id = row.get("browseId") or row.get("playlistId")
    if not isinstance(album_id,str) or not re.fullmatch(r"[\w-]{6,180}",album_id):
        return None
    return {"id":album_id,"title":str(row.get("title") or "Álbum")[:200],
            "artist":_artist(row.get("artists")) or str(row.get("artist") or ""),
            "cover":_cover(row),"year":row.get("year")}


def _unique(rows: list[dict]) -> list[dict]:
    seen: set[str] = set()
    output = []
    for row in rows:
        key = str(row.get("videoId") or row.get("id") or "")
        if key and key not in seen:
            seen.add(key)
            output.append(row)
    return output


def _search(term: str, category: str, limit: int) -> list[dict]:
    term = term.strip()[:140]
    if not term:
        return []
    return _yt().search(term, filter=category, limit=limit) or []



def _canonical(value: str) -> str:
    import unicodedata
    text = unicodedata.normalize("NFKD", str(value or ""))
    return " ".join("".join(c.lower() if c.isalnum() else " " for c in text if not unicodedata.combining(c)).split())


def _same_artist(song: dict, artist: str) -> bool:
    # O título da música NÃO prova a identidade do músico (ex.: "Electric Wizard" por outro artista).
    expected = _canonical(artist)
    names = [_canonical(x) for x in song.get("artist", "").split(",")]
    return bool(expected) and expected in names


def _catalog_spam(song: dict) -> bool:
    """Remove listagens de marketing por palavras-chave, sem barrar artistas legítimos."""
    text = _canonical(str(song.get("album", "")))
    tags = ("stoner", "psychedelic", "rap", "desert", "radio", "rock", "chill", "beats", "music")
    # Compilações de keywords (como 'Psychedelic Spaghetti Western Cyberpunk Desert Rock Stoner Music')
    return sum(bool(re.search(r"\b" + t + r"\b", text)) for t in tags) >= 5


def _usable_song(row: dict) -> dict | None:
    if row.get("resultType") not in (None, "song", "video"):
        return None
    candidate = _song(row)
    return candidate if candidate and not _catalog_spam(candidate) else None


# Artistas reconhecidos como referências de alguns subgêneros.
# É uma curadoria pequena e explícita, não um classificador universal de música.
_GENRE_SEEDS = {
    "stoner": ("Kyuss", "Fu Manchu", "Sleep", "Truckfighters", "Nebula", "Colour Haze"),
    "stoner rock": ("Kyuss", "Fu Manchu", "Truckfighters", "Nebula", "Colour Haze"),
    "desert rock": ("Kyuss", "Yawning Man", "Fu Manchu", "Nebula"),
    "doom metal": ("Black Sabbath", "Candlemass", "Windhand", "Monolord", "Electric Wizard"),
    "stoner doom": ("Sleep", "Electric Wizard", "Windhand", "Monolord", "Acid King"),
    "psychedelic rock": ("Colour Haze", "King Gizzard & The Lizard Wizard", "The Black Angels", "Kikagaku Moyo"),
    "shoegaze": ("Slowdive", "My Bloody Valentine", "Ride", "Lush"),
}


def _versionless_title(value: str) -> str:
    """Remove apenas qualificadores de edição, não palavras da canção."""
    value = re.sub(r"\s*\((?:official\s+(?:music\s+)?video|lyric\s+video|audio|remaster(?:ed)?(?:\s+\d{4})?|\d{4}\s+remaster(?:ed)?|visualizer)\)\s*$", "", value, flags=re.I)
    return _canonical(value)


def alternatives(title: str, artist: str, exclude: str = "") -> dict:
    """Sugestões SEM garantia de incorporação e SEM tentativa de contornar bloqueios.

    Os itens são apenas outras gravações listadas pelo YouTube Music, escolhidas
    manualmente pelo usuário. Rejeita músicas de artistas homônimos e títulos
    coincidentes de artistas diferentes.
    """
    title = title.strip()[:160]
    artist = artist.strip()[:160]
    if not title or not artist:
        raise ValueError("Informe música e artista")
    if exclude and not re.fullmatch(r"[a-zA-Z0-9_-]{11}", exclude):
        raise ValueError("ID da gravação inválido")
    requested_title = _versionless_title(title)
    if not requested_title:
        raise ValueError("Título inválido")

    def fetch():
        output = []
        for row in _search(f"{artist} {title}", "songs", 40):
            song = _usable_song(row)
            if not song or song["videoId"] == exclude:
                continue
            if not _same_artist(song, artist):
                continue
            if _versionless_title(song["title"]) != requested_title:
                continue
            output.append(song)
        return {"tracks": _unique(output)[:6], "note": "Outra gravação pode também não permitir incorporação."}

    return _remember(("alternatives-v1", title.casefold(), artist.casefold(), exclude), fetch, ttl=300)

def recommendations(artists: list[str]) -> dict:
    seed = tuple(a.strip()[:80] for a in artists if a.strip())[:4]
    if not seed:
        return {"songs":[],"albums":[],"seedArtists":[],"note":"Ouça músicas ou salve artistas para gerar recomendações."}
    def fetch():
        songs, albums = [], []
        for artist in seed:
            songs.extend(filter(None, (_usable_song(x) for x in _search(f"{artist} similar music", "songs", 12))))
            albums.extend(filter(None, (_album(x) for x in _search(artist, "albums", 15))))
        # Filtragem por artista em álbuns para evitar falsos homônimos.
        normalized = {a.casefold() for a in seed}
        albums = [x for x in albums if x["artist"].casefold() in normalized]
        return {"songs":_unique(songs)[:40],"albums":_unique(albums)[:40],"seedArtists":list(seed),
                "note":"Sugestões experimentais baseadas nos teus artistas e no catálogo."}
    return _remember(("recs",seed),fetch)


def artist_neighbors(artist_id: str, name: str) -> dict:
    if not re.fullmatch(r"[\w-]{8,180}",artist_id):
        raise ValueError("ID do artista inválido")
    def fetch():
        artist = _yt().get_artist(artist_id)
        related = artist.get("related") or {}
        raw = related.get("results",[]) if isinstance(related,dict) else related if isinstance(related,list) else []
        neighbors=[]
        for row in raw:
            if not isinstance(row,dict): continue
            rid = row.get("browseId") or row.get("id")
            if not rid or rid == artist_id: continue
            neighbors.append({"id":rid,"name":row.get("title") or row.get("name") or "Artista",
                              "cover":_cover(row)})
        return {"artist":name or artist.get("name") or "", "artistId":artist_id,
                "artists":_unique([{**r,"id":r["id"]} for r in neighbors])[:24]}
    return _remember(("neighbors",artist_id),fetch)


def radio(artist: str, artist_id: str = "", seed_video_id: str = "") -> dict:
    artist = artist.strip()[:120]
    if not artist and not seed_video_id:
        raise ValueError("Informe um artista")
    if seed_video_id and not re.fullmatch(r"[\w-]{11}",seed_video_id):
        raise ValueError("ID de faixa inválido")
    def fetch():
        songs = []
        if seed_video_id:
            try:
                rows = _yt().get_watch_playlist(videoId=seed_video_id,limit=30).get("tracks",[])
                for row in rows:
                    track = _usable_song(row)
                    if track and (not artist or _same_artist(track,artist)):
                        songs.append(track)
            except Exception:
                pass
        # Nunca usa apenas uma coincidência de TÍTULO para atribuir uma faixa à banda.
        if artist:
            for row in _search(artist,"songs",40):
                track = _usable_song(row)
                if track and _same_artist(track,artist):
                    songs.append(track)
        primary = _unique(songs)[:30]
        # Só sugere outros artistas quando o usuário escolheu um perfil inequívoco por ID.
        related = []
        if artist_id and re.fullmatch(r"[\w-]{8,180}",artist_id):
            try:
                for item in artist_neighbors(artist_id,artist).get("artists",[])[:3]:
                    other = str(item.get("name") or "")
                    if not other or _canonical(other)==_canonical(artist):
                        continue
                    for row in _search(other,"songs",5):
                        track = _usable_song(row)
                        if track and _same_artist(track,other):
                            related.append({**track,"recommended":True})
            except Exception:
                pass
        return {"artist":artist,"artistId":artist_id,"tracks":_unique(primary+related)[:35],
                "note":"Faixas do artista verificado" + (" e sugestões relacionadas" if related else "") + "."}
    return _remember(("radio-v2",artist,artist_id,seed_video_id),fetch,ttl=600)


def explore(genre: str, mood: str) -> dict:
    genre = genre.strip()[:70]
    mood = mood.strip().lower()[:30]
    if not genre and not mood:
        raise ValueError("Escolha gênero ou clima")
    genre_key = _canonical(genre)
    seeds = _GENRE_SEEDS.get(genre_key, ())
    phrase = " ".join(x for x in (genre, _MOODS.get(mood, mood)) if x)

    def fetch():
        if seeds:
            # Prefere a identidade do artista a resultados cujo álbum está
            # cheio de palavras-chave. Mantém subgêneros específicos relevantes.
            songs = []
            albums = []
            for seed in seeds:
                songs.extend(song for row in _search(seed, "songs", 12)
                             if (song := _usable_song(row)) and _same_artist(song, seed))
                albums.extend(album for row in _search(seed, "albums", 6)
                              if (album := _album(row)) and _canonical(album["artist"]) == _canonical(seed))
            # Algumas bandas próximas ao clima pedido cabem como recomendações,
            # mesmo sem pertencerem à lista principal do gênero. Nunca usa
            # somente coincidências do nome no título como prova de autoria.
            if mood == "psicodelico":
                neighboring = {"the black angels", "kikagaku moyo", "colour haze"}
                for row in _search(phrase, "songs", 30):
                    candidate = _usable_song(row)
                    if candidate and _canonical(candidate["artist"]) in neighboring:
                        songs.append(candidate)
            note = "Seleção inicial de artistas associados ao gênero e sugestões próximas ao clima. Clima é aproximado, não verificado faixa a faixa."
        else:
            songs = [song for row in _search(phrase, "songs", 50)
                     if (song := _usable_song(row))]
            albums = [album for row in _search(phrase, "albums", 20)
                      if (album := _album(row))]
            note = "Resultados de busca aproximados; sem metadados oficiais de gênero/clima para cada faixa."
        return {"genre": genre, "mood": mood, "songs": _unique(songs)[:30],
                "albums": _unique(albums)[:20], "note": note}

    return _remember(("explore-v3", genre_key, mood), fetch)

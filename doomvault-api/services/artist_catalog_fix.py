"""BZtune — catálogo por perfil do YouTube Music.

Instalado ao final de app.py, depois do registro de todas as rotas.
Não cria rotas adicionais nem altera SQLite ou biblioteca local.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

from flask import jsonify, request


_VALID_CHANNEL = re.compile(r"^UC[A-Za-z0-9_-]{20,}$")
_SECTIONS = (
    "albums", "singles", "eps", "compilations", "live_albums", "shows",
)


def _norm(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).lower()
    return " ".join("".join(char if char.isalnum() else " " for char in text
                            if not unicodedata.combining(char)).split())


def _cover(row: dict[str, Any]) -> str | None:
    images = row.get("thumbnails") or []
    return images[-1].get("url") if images and isinstance(images[-1], dict) else None


def _album(row: Any, fallback_artist: str, section: str) -> dict[str, Any] | None:
    if not isinstance(row, dict):
        return None
    album_id = row.get("browseId") or row.get("id")
    if not isinstance(album_id, str) or not album_id.startswith(("MPRE", "OLAK")):
        return None
    people = row.get("artists") or []
    artists = [person.get("name") for person in people
               if isinstance(person, dict) and person.get("name")]
    return {
        "id": album_id,
        "title": str(row.get("title") or "Sem título"),
        "artist": ", ".join(artists) if artists else fallback_artist,
        "year": row.get("year"),
        "cover": _cover(row),
        "release_type": row.get("type") or section,
    }


def install_artist_catalog_fix(app: Any, yt: Any) -> None:
    """Substitui as duas views do catálogo sem redefinir URLs existentes."""

    def artist_discography(artist_id: str):
        given_name = request.args.get("name", "").strip()[:200]
        if not given_name:
            return jsonify({"error": "Informe o nome do artista."}), 400
        valid_id = bool(_VALID_CHANNEL.fullmatch(artist_id))
        albums: list[dict[str, Any]] = []
        seen: set[str] = set()
        sections: dict[str, int] = {}
        warnings: list[str] = []
        verified_id = False
        display_name = given_name

        def add(rows: Any, section: str, *, strict_id: bool = False) -> None:
            added = 0
            for row in rows or []:
                if not isinstance(row, dict):
                    continue
                if strict_id:
                    people = row.get("artists") or []
                    ids = {str(person.get("id")) for person in people
                           if isinstance(person, dict) and person.get("id")}
                    names = {_norm(person.get("name")) for person in people
                             if isinstance(person, dict)}
                    if valid_id:
                        if artist_id not in ids:
                            continue
                    elif _norm(given_name) not in names:
                        continue
                album = _album(row, display_name, section)
                if album and album["id"] not in seen:
                    seen.add(album["id"])
                    albums.append(album)
                    added += 1
            sections[section] = sections.get(section, 0) + added

        if valid_id:
            try:
                info = yt.get_artist(artist_id)
                if not isinstance(info, dict):
                    raise ValueError("Resposta inválida da página do artista")
                verified_id = True
                display_name = str(info.get("name") or given_name)
                for section in _SECTIONS:
                    group = info.get(section)
                    if not isinstance(group, dict):
                        continue
                    add(group.get("results"), section)
                    params = group.get("params")
                    if params:
                        try:
                            # O browseId da seção pode diferir do ID do perfil.
                            section_id = group.get("browseId") or artist_id
                            # limit=None percorre todas as continuações disponíveis.
                            expanded = yt.get_artist_albums(section_id, params, limit=None)
                            add(expanded.get("results") if isinstance(expanded, dict) else expanded,
                                section)
                        except Exception as exc:
                            warnings.append(f"{section}: {type(exc).__name__}")
            except Exception as exc:
                warnings.append(f"get_artist: {type(exc).__name__}")
        else:
            warnings.append("ID do perfil inválido; resultados serão limitados")

        # Busca apenas para complementar. Nunca mistura homônimos por nome.
        try:
            candidates = yt.search(given_name, filter="albums", limit=100)
            add(candidates, "search", strict_id=True)
        except Exception as exc:
            warnings.append(f"search: {type(exc).__name__}")

        albums.sort(key=lambda a: (
            int(a["year"]) if str(a.get("year") or "").isdigit() else 9999,
            _norm(a["title"]), a["id"]
        ))
        return jsonify({
            "artist": display_name,
            "artist_id": artist_id,
            "count": len(albums),
            "albums": albums,
            "sections": sections,
            "verified_id": verified_id,
            "complete": False,  # Fonte externa não garante discografia universal.
            "source": "YouTube Music artist page + sections + verified search"
            if verified_id else "YouTube Music search (ID not verified)",
            "warnings": warnings,
        })

    def search_artists():
        query = request.args.get("q", "").strip()[:200]
        if not query:
            return jsonify({"error": "Informe o parâmetro q."}), 400
        try:
            rows = yt.search(query, filter="artists", limit=100)
            seen_ids: set[str] = set()
            result = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                artist_id = row.get("browseId")
                if not isinstance(artist_id, str) or not artist_id or artist_id in seen_ids:
                    continue
                seen_ids.add(artist_id)
                result.append({
                    "id": artist_id,
                    "name": row.get("artist") or row.get("title") or "Artista",
                    "image": _cover(row),
                    "subscribers": row.get("subscribers"),
                    "description": row.get("description"),
                })
            return jsonify({"query": query, "count": len(result), "results": result})
        except Exception:
            app.logger.exception("Falha ao pesquisar perfis musicais")
            return jsonify({"error": "Falha ao pesquisar artistas."}), 502

    endpoints = {
        "/api/artists/<artist_id>/albums": artist_discography,
        "/api/artists": search_artists,
    }
    for url, view in endpoints.items():
        rules = [rule for rule in app.url_map.iter_rules() if rule.rule == url]
        if len(rules) != 1:
            raise RuntimeError(f"Esperada exatamente uma rota {url}; encontradas {len(rules)}")
        app.view_functions[rules[0].endpoint] = view

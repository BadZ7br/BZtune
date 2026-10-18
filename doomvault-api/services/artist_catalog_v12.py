"""Catálogo por ID único do artista; preserva homônimos e lançamentos distintos.

Adicione ao final das rotas de app.py (antes de app.run):
    from artist_catalog_v12 import install_artist_catalog_v12
    install_artist_catalog_v12(app, yt)
"""
from __future__ import annotations

import re
import unicodedata
from flask import jsonify, request


def norm(value: str) -> str:
    return " ".join("".join(c if c.isalnum() else " " for c in unicodedata.normalize("NFKD", str(value or "")).lower() if not unicodedata.combining(c)).split())


def thumb(item: dict):
    images = item.get("thumbnails") or []
    return images[-1].get("url") if images and isinstance(images[-1], dict) else None


def normalize_release(row, fallback_artist: str, kind: str = "album"):
    if not isinstance(row, dict):
        return None
    ident = row.get("browseId") or row.get("id")
    if not isinstance(ident, str) or not ident:
        return None
    # Somente releases abertos por get_album (browseId de álbum / playlist).
    if not (ident.startswith("MPRE") or ident.startswith("OLAK") or ident.startswith("VL") or ident.startswith("PL")):
        return None
    people = row.get("artists") or []
    names = [a.get("name", "") for a in people if isinstance(a, dict) and a.get("name")]
    return {
        "id": ident,
        "title": str(row.get("title") or "Lançamento sem título"),
        "artist": fallback_artist if not names else ", ".join(names),
        "year": row.get("year"),
        "cover": thumb(row),
        "release_type": row.get("type") or kind,
    }


def install_artist_catalog_v12(app, yt):
    """Troca apenas o handler da discografia; não toca nas outras rotas."""
    def discography(artist_id):
        name = request.args.get("name", "").strip()[:200]
        if not name:
            return jsonify({"error": "Informe o nome do artista."}), 400
        albums = []
        seen = set()
        sections: dict[str, int] = {}
        failures = []
        is_real_id = bool(re.fullmatch(r"UC[a-zA-Z0-9_-]{20,}", artist_id))
        verified = False
        chosen_name = name

        def add(items, section, only_id=False):
            count = 0
            for row in items or []:
                if not isinstance(row, dict):
                    continue
                # Pesquisa por nome só entra se o ID do artista combinar.
                if only_id:
                    participants = row.get("artists") or []
                    ids = [str(a.get("id") or "") for a in participants if isinstance(a, dict)]
                    if is_real_id and not any(x == artist_id for x in ids):
                        continue
                    if not is_real_id:
                        names = [str(a.get("name") or "") for a in participants if isinstance(a, dict)]
                        if not any(norm(x) == norm(name) for x in names):
                            continue
                entry = normalize_release(row, chosen_name, section)
                if entry and entry["id"] not in seen:
                    albums.append(entry)
                    seen.add(entry["id"])
                    count += 1
            sections[section] = sections.get(section, 0) + count

        if is_real_id:
            try:
                info = yt.get_artist(artist_id)
                if not isinstance(info, dict):
                    raise ValueError("Resposta de artista inválida")
                verified = True
                chosen_name = str(info.get("name") or name)
                for section in ("albums", "singles", "eps", "compilations", "live_albums", "featured_on"):
                    group = info.get(section) or {}
                    if not isinstance(group, dict):
                        continue
                    add(group.get("results") or [], section)
                    # get_artist_albums normalmente já carrega todas as continuações.
                    params = group.get("params")
                    if params:
                        try:
                            expanded = yt.get_artist_albums(artist_id, params)
                            if isinstance(expanded, dict):
                                expanded = expanded.get("results") or []
                            add(expanded, section)
                        except Exception as exc:
                            failures.append(f"{section}: {type(exc).__name__}")
            except Exception as exc:
                failures.append(f"get_artist: {type(exc).__name__}")

        # Pesquisa complementar: só aceita resultado com o ID exato do artista,
        # nunca outro homônimo com o mesmo nome.
        try:
            for category in ("albums",):
                found = yt.search(name, filter=category, limit=100)
                add(found, "search", only_id=True)
        except Exception as exc:
            failures.append(f"search: {type(exc).__name__}")

        albums.sort(key=lambda a: (int(a["year"]) if str(a["year"] or "").isdigit() else 0,
                                   norm(a["title"]), a["id"]))
        return jsonify({
            "artist": chosen_name, "artist_id": artist_id, "count": len(albums),
            "albums": albums, "sections": sections,
            "verified_id": verified,
            "complete": False,  # Nem mesmo get_artist garante catálogo universal/exaustivo.
            "source": "YouTube Music (página do artista + seções + pesquisa)",
            "warnings": failures,
        })

    matches = [r for r in app.url_map.iter_rules() if r.rule == "/api/artists/<artist_id>/albums"]
    if len(matches) != 1:
        raise RuntimeError("Rota de discografia não encontrada (ou duplicada) no app.py")
    app.view_functions[matches[0].endpoint] = discography

    # A pesquisa original trazia no máximo 20 artistas. Não agrupar por nome:
    # IDs distintos representam perfis distintos, mesmo se homônimos.
    def search_artists():
        query = request.args.get("q", "").strip()[:200]
        if not query:
            return jsonify({"error":"Informe o parâmetro q."}), 400
        try:
            rows = yt.search(query, filter="artists", limit=100)
            result = []
            seen_ids = set()
            for row in rows:
                uid = row.get("browseId")
                if not uid or uid in seen_ids:
                    continue
                seen_ids.add(uid)
                result.append({"id":uid,"name":row.get("artist") or row.get("title") or "Artista",
                               "image":thumb(row),"subscribers":row.get("subscribers"),
                               "description":row.get("description")})
            return jsonify({"query":query,"count":len(result),"results":result})
        except Exception:
            app.logger.exception("Falha ao consultar perfis de artistas")
            return jsonify({"error":"Falha ao pesquisar artistas."}), 502

    artist_routes = [r for r in app.url_map.iter_rules() if r.rule == "/api/artists"]
    if len(artist_routes) == 1:
        app.view_functions[artist_routes[0].endpoint] = search_artists

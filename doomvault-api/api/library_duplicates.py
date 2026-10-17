"""Detector consultivo de possíveis duplicatas da biblioteca BZtune.

Não exclui, move, altera ou lê o conteúdo dos arquivos de áudio.
Grupos de metadados não constituem prova de conteúdo de áudio idêntico.
"""
from __future__ import annotations

from collections import defaultdict
import re
import unicodedata
from pathlib import Path
from typing import Any, Iterable, Mapping


def _normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).casefold()
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


# Only remove a *terminal* edition marker: never turn "Live and Let Die" into "and Let Die".
_EDITION = (r"live(?:\s+at\s+[^\]\)]+)?|acoustic|remaster(?:ed)?(?:\s+\d{4})?"
            r"|(?:19|20)\d{2}\s+remaster(?:ed)?|demo|instrumental|radio\s+edit"
            r"|alternate\s+(?:take|mix|version)|alt\.?(?:\s+mix)?|remix|mono|stereo"
            r"|original\s+mix|single\s+version|session\s+version")
_SUFFIX = re.compile(r"\s*[\[(]\s*(?:" + _EDITION + r")\s*[\])]\s*$", re.I)
_DASH_SUFFIX = re.compile(r"\s+[-–—]\s*(?:" + _EDITION + r")\s*$", re.I)
_EDITION_LABELS: tuple[tuple[str, str], ...] = (
    (r"\bremaster(?:ed)?\b", "remaster"),
    (r"\blive\b", "ao vivo"),
    (r"\bacoustic\b", "acústica"),
    (r"\bdemo\b", "demo"),
    (r"\binstrumental\b", "instrumental"),
    (r"\bremix\b", "remix"),
    (r"\bradio\s+edit\b", "radio edit"),
    (r"\balternate\b|\balt\s+mix\b", "alternativa"),
    (r"\bmono\b", "mono"),
    (r"\bstereo\b", "stereo"),
)


def _title_base(value: str) -> str:
    value = str(value or "")
    while True:
        trimmed = _DASH_SUFFIX.sub("", _SUFFIX.sub("", value)).strip()
        if trimmed == value.strip():
            break
        value = trimmed
    return _normalize(value)


def _edition_signals(track: Mapping[str, Any]) -> tuple[str, ...]:
    """Edition hints from explicit markers; never infer 'live' from a title like 'Live and Let Die'."""
    title = str(track.get("title") or "")
    album = str(track.get("album") or "")
    filename = Path(str(track.get("filename") or "")).stem
    suffix = ""
    for pattern in (_SUFFIX, _DASH_SUFFIX):
        match = pattern.search(title)
        if match:
            suffix = title[match.start():]
            break
    # File name edition hints are accepted only if clearly set apart as a suffix.
    for pattern in (_SUFFIX, _DASH_SUFFIX):
        match = pattern.search(filename)
        if match:
            suffix += " " + filename[match.start():]
            break
    # Album 'Live at...' and parenthesized metadata count, but not generic 'Live' in a name.
    album_flags = re.findall(
        r"\bremaster(?:ed)?\b|\bacoustic\b|\bdemo\b|\bremix\b|\blive\s+at\b|[\[(]\s*live\s*[\])]|\bmono\b|\bstereo\b",
        album, flags=re.I)
    marked = suffix + " " + " ".join(album_flags)
    signals = [label for pattern, label in _EDITION_LABELS if re.search(pattern, marked, re.I)]
    suffix_year = re.search(r"\b((?:19|20)\d{2})\s+remaster(?:ed)?\b", title + " " + album, re.I)
    if suffix_year and "remaster" in signals:
        signals.append("remaster " + suffix_year.group(1))
    return tuple(sorted(set(signals)))


def _item(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "title": str(row.get("title") or ""),
        "artist": str(row.get("artist") or ""),
        "album": str(row.get("album") or ""),
        "year": row.get("year"),
        "trackNumber": row.get("track_number"),
        "filename": str(row.get("filename") or ""),
        "bytes": int(row.get("bytes") or 0),
        "mime": str(row.get("mime") or ""),
        "coverUrl": f"/api/library/tracks/{row['id']}/cover",
        "audioUrl": f"/api/library/tracks/{row['id']}/audio",
        "signals": list(_edition_signals(row)),
    }


def scan_duplicates(rows: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    """Classify exact hashes, suspected matches and intentional-looking editions.

    The SQLite sha256 UNIQUE index generally prevents exact duplicate rows.
    Everything inferred from titles is *review-only*, never a delete recommendation.
    """
    data = list(rows)
    by_hash: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    by_name: dict[tuple[str, str], list[Mapping[str, Any]]] = defaultdict(list)
    for row in data:
        sha = str(row.get("sha256") or "")
        if sha:
            by_hash[sha].append(row)
        key = (_normalize(row.get("artist")), _title_base(str(row.get("title") or "")))
        if all(key):
            by_name[key].append(row)

    groups: list[dict[str, Any]] = []
    exact_pair_ids: set[frozenset[str]] = set()
    for hash_value, items in sorted(by_hash.items()):
        if len(items) < 2:
            continue
        ids = [str(row["id"]) for row in items]
        exact_pair_ids.add(frozenset(ids))
        groups.append({
            "id": "hash:" + hash_value[:16], "kind": "identical", "confidence": "confirmed",
            "reason": "Mesmo SHA-256 armazenado. O banco normalmente impede este caso.",
            "tracks": [_item(row) for row in sorted(items, key=lambda r: str(r["id"]))],
        })

    for key, items in sorted(by_name.items()):
        if len(items) < 2:
            continue
        unique = list({str(row["id"]): row for row in items}.values())
        if len(unique) < 2 or frozenset(str(i["id"]) for i in unique) in exact_pair_ids:
            continue
        signal_sets = {tuple(_edition_signals(row)) for row in unique}
        album_ids = {_normalize(row.get("album")) for row in unique}
        years = {str(row.get("year") or "") for row in unique if row.get("year")}
        versions = len(signal_sets) > 1 or any(signals for signals in signal_sets) or len(album_ids) > 1 or len(years) > 1
        kind = "versions" if versions else "possible"
        reason = (
            "Mesmo artista e composição, mas há sinais de edições/álbuns diferentes. Não trate como arquivos repetidos."
            if versions else
            "Artista e título correspondem, porém os hashes são diferentes. Pode ser outra gravação ou codificação."
        )
        groups.append({
            "id": "name:" + key[0] + ":" + key[1],
            "kind": kind, "confidence": "review", "reason": reason,
            "tracks": [_item(row) for row in sorted(unique, key=lambda r: (str(r.get("album") or ""), str(r["id"])))],
        })
    order = {"identical": 0, "possible": 1, "versions": 2}
    groups.sort(key=lambda group: (order[group["kind"]], group["id"]))
    return {
        "count": len(data),
        "summary": {
            "identical": sum(g["kind"] == "identical" for g in groups),
            "possible": sum(g["kind"] == "possible" for g in groups),
            "versions": sum(g["kind"] == "versions" for g in groups),
        },
        "groups": groups,
        "warning": "Comparações por nome não confirmam áudio idêntico. Não apague versões ou remasters automaticamente.",
    }

"""Política de origem da API de funcionalidades do BZtune.

A WebView do Desktop usa uma origem diferente do servidor web de desenvolvimento.
Nunca aceitar domínios externos para operações com biblioteca, backup e histórico.
"""
from __future__ import annotations

from urllib.parse import urlsplit

_DESKTOP_ORIGINS = frozenset({
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
})
_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1"})


def origin_permitted(origin: str, *, desktop_mode: bool = False) -> bool:
    """Aceita hosts web locais e, somente no Desktop, as origens exatas do Tauri.

    Requisições locais de CLI sem Origin mantêm a compatibilidade existente.
    O Desktop também possui validação própria no backend_entry.py.
    """
    if not origin:
        return True
    if desktop_mode and origin in _DESKTOP_ORIGINS:
        return True
    try:
        parsed = urlsplit(origin)
        return (
            parsed.scheme in ("http", "https")
            and parsed.hostname in _LOCAL_HOSTS
            and parsed.username is None
            and parsed.password is None
            and parsed.path in ("", "/")
            and not parsed.query
            and not parsed.fragment
        )
    except ValueError:
        return False

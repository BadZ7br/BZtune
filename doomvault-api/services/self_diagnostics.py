"""Bounded, read-only diagnostic probes. Reports contain no user data."""
import time
import requests

# No caller-supplied URLs, queries, cookies or credentials.
NETWORK_TARGETS = {
    "LRCLIB": "https://lrclib.net/api/search?q=bztune-diagnostic-connectivity",
    "Catálogo YouTube Music": "https://music.youtube.com/",
    "Servidor de atualizações GitHub": "https://github.com/BadZ7br/BZtune/releases/latest",
}


def network_check(name):
    start = time.monotonic()
    try:
        with requests.get(NETWORK_TARGETS[name], timeout=(3, 4), stream=True,
                          allow_redirects=False, headers={"User-Agent": "BZtune-Diagnostics"}) as response:
            code = response.status_code
        # Redirects prove contact, not final destination availability.
        status = "ok" if 200 <= code < 300 else "warning"
        detail = (f"HTTP {code}; {round((time.monotonic()-start)*1000)} ms. "
                  "Contato HTTP apenas; não comprova busca, reprodução ou atualização.")
    except requests.RequestException:
        status, detail = "failed", "Conexão indisponível ou prazo excedido; tente novamente."
    return {"name": name, "status": status, "detail": detail}

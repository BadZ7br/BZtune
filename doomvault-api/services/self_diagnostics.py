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


def files_check(database, audio_dir, limit=100):
    """Sample existing references without creating a missing database or following escapes."""
    import sqlite3
    import contextlib
    from pathlib import Path
    checks = []
    missing = unreadable = invalid = 0
    root = Path(audio_dir).resolve()
    try:
        with contextlib.closing(sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True, timeout=2)) as db:
            rows = db.execute('SELECT stored_name, bytes FROM tracks ORDER BY id LIMIT ?', (limit + 1,)).fetchall()
        for stored, expected in rows[:limit]:
            path = (root / stored).resolve()
            if not path.is_relative_to(root):
                invalid += 1
                continue
            try:
                if not path.is_file():
                    missing += 1
                else:
                    with path.open('rb') as stream:
                        stream.read(16)
                    if path.stat().st_size != expected:
                        invalid += 1
            except OSError:
                unreadable += 1
        count = min(limit, len(rows))
        detail = f'Amostra de {count} arquivos: {missing} ausentes, {unreadable} ilegíveis, {invalid} referências/tamanhos inconsistentes.'
        if len(rows) > limit:
            detail += ' Há mais arquivos não examinados.'
        detail += ' Não verifica decodificação completa nem capas.'
        checks.append({'name':'Arquivos locais (amostra)', 'status':'warning' if missing or unreadable or invalid else ('ok' if count else 'not-tested'), 'detail':detail})
    except (OSError, sqlite3.Error, TypeError, ValueError):
        checks.append({'name':'Arquivos locais (amostra)', 'status':'failed', 'detail':'Não foi possível consultar as referências; nenhum arquivo foi alterado.'})
    return checks


def tools_check(audio_dir):
    import shutil
    import subprocess
    import tempfile
    results = []
    for tool in ('ffmpeg', 'ffprobe'):
        try:
            executable = shutil.which(tool)
            if not executable:
                raise OSError('missing')
            result = subprocess.run([executable, '-version'], stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL, timeout=3, check=False)
            ok = result.returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            ok = False
        results.append({'name':f'Execução {tool}', 'status':'ok' if ok else 'failed',
                        'detail':'Ferramenta executada.' if ok else 'Ferramenta ausente, falhou ou excedeu o prazo.'})
    try:
        # Unique disposable file, never an existing track. Closed/deleted even on failure.
        with tempfile.TemporaryFile(dir=audio_dir) as stream:
            stream.write(b'BZtune diagnostic'); stream.flush(); stream.seek(0)
            if stream.read() != b'BZtune diagnostic':
                raise OSError('readback')
        results.append({'name':'Gravação para downloads', 'status':'ok', 'detail':'Arquivo temporário gravado, lido e removido; músicas preservadas.'})
    except OSError:
        results.append({'name':'Gravação para downloads', 'status':'failed', 'detail':'Não foi possível gravar e ler o arquivo temporário.'})
    try:
        free = shutil.disk_usage(audio_dir).free
        results.append({'name':'Espaço disponível', 'status':'warning' if free < 1024**3 else 'ok',
                        'detail':f'{free // (1024**2)} MiB livres. O espaço necessário depende do download.'})
    except OSError:
        results.append({'name':'Espaço disponível', 'status':'failed', 'detail':'Consulta indisponível.'})
    return results

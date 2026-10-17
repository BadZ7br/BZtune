# Backend do BZtune

Backend Python/Flask com SQLite local.

## Windows

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

`app.py` continua na raiz e carrega blueprints em `api/` e serviços em `services/`.
Os módulos antigos que continuam na raiz são adaptadores para imports de versões anteriores.

**Importante:** `doomvault_library/` guarda o banco SQLite, MP3/FLAC e capas. Nunca substitua ou publique essa pasta.

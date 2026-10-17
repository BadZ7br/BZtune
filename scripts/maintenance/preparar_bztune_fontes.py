"""Cria um ZIP de revisão com todo o código do BZtune, sem biblioteca musical nem segredos locais.
Execute este arquivo dentro da pasta raiz do repositório.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parent / "BZtune_projeto_fontes.zip"

SKIP_DIRS = {
    ".git", ".venv", "venv", "node_modules", "dist", "build", "__pycache__",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", ".vite", ".next", ".idea",
    ".vscode", "coverage", "backups", "doomvault_library", "cover_cache",
    "audio", "covers", "downloads", "tmp", "temp", "logs", "media",
}
SKIP_EXTS = {
    ".db", ".sqlite", ".sqlite3", ".mp3", ".flac", ".wav", ".ogg",
    ".opus", ".aac", ".m4a", ".mp4", ".webm", ".mov", ".zip",
    ".7z", ".rar", ".exe", ".dll", ".pyd", ".pyc", ".pem",
    ".key", ".p12", ".pfx", ".crt",
}
ALLOW_EXTS = {
    ".py", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".css",
    ".scss", ".sass", ".html", ".json", ".md", ".txt", ".toml",
    ".yaml", ".yml", ".ini", ".cfg", ".sh", ".ps1", ".bat",
    ".lock", ".sql", ".svg",
}
ALLOW_SPECIAL = {
    ".gitignore", ".gitattributes", ".npmrc.example", ".editorconfig",
    ".prettierrc", ".eslintrc", "Dockerfile", "Makefile",
}
SKIP_NAMES = {
    "cookies.txt", "credentials.json", "service-account.json", "secrets.json",
    "id_rsa", "id_ed25519", "authorized_keys",
}


def included(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part.lower() in SKIP_DIRS for part in rel.parts[:-1]):
        return False
    name = path.name.lower()
    if name in SKIP_NAMES or name == ".env" or name.startswith(".env."):
        return False
    if any(word in name for word in ("cookie", "credential", "private-key", "secret-key")):
        return False
    if path.suffix.lower() in SKIP_EXTS:
        return False
    if path.suffix.lower() not in ALLOW_EXTS and path.name not in ALLOW_SPECIAL:
        return False
    if path.stat().st_size > 2_000_000:
        return False
    return True


def main() -> None:
    if not (ROOT / "doomvault").is_dir() or not (ROOT / "doomvault-api").is_dir():
        raise SystemExit("ERRO: coloque este script na pasta que contém doomvault e doomvault-api.")
    candidates = sorted(p for p in ROOT.rglob("*") if p.is_file() and included(p))
    with ZipFile(OUTPUT, "w", ZIP_DEFLATED, compresslevel=7) as archive:
        for path in candidates:
            archive.write(path, path.relative_to(ROOT).as_posix())
    print(f"Criado: {OUTPUT}")
    print(f"Arquivos de código/configuração incluídos: {len(candidates)}")
    print("IMPORTANTE: revise o ZIP antes de compartilhar. Segredos podem estar escritos dentro de código-fonte.")
    print("Não foram incluídos banco SQLite, arquivos de áudio, .env nem diretórios de biblioteca local.")


if __name__ == "__main__":
    main()

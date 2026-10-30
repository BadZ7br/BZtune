"""Diagnóstico rápido da organização do código, sem dependências externas."""
from __future__ import annotations
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "doomvault" / "src"
BACK = ROOT / "doomvault-api"


def check():
    errors = []
    stylesheet = FRONT / "styles.css"
    if not stylesheet.is_file(): errors.append("CSS universal ausente")
    entries = {FRONT / "main.tsx": stylesheet}
    mobile_entry = FRONT / "mobile" / "main.tsx"
    if mobile_entry.is_file(): entries[mobile_entry] = FRONT / "mobile" / "mobile.css"
    all_css = set(FRONT.rglob("*.css"))
    if all_css != set(entries.values()): errors.append(f"CSS deve pertencer às entradas desktop/mobile: {all_css}")
    css_imports = re.compile(r"(?m)^\s*import\s+[\"']([^\"']+\.css)[\"']\s*;?")
    if not re.search(r"import [\"']\./styles\.css[\"']", (FRONT / "main.tsx").read_text(encoding="utf-8")):
        errors.append("Import do CSS universal ausente no main.tsx")
    relative_imports = re.compile(r"\b(?:from|import)\s*[\"'](\.[^\"']+)[\"']")
    for code in FRONT.rglob("*"):
        if code.suffix not in {".tsx", ".ts"}: continue
        src = code.read_text(encoding="utf-8")
        imports_css = css_imports.findall(src)
        if imports_css and (code not in entries or len(imports_css) != 1 or (code.parent / imports_css[0]).resolve() != entries[code].resolve()):
            errors.append(f"CSS fora da entrada de plataforma em {code.relative_to(ROOT)}: {imports_css}")
        if code in entries and not imports_css:errors.append(f"CSS da entrada ausente: {code.relative_to(ROOT)}")
        for target in relative_imports.findall(src):
            base = (code.parent / target)
            if not any(path.is_file() for path in [base, base.with_suffix(".ts"), base.with_suffix(".tsx"), base.with_suffix(".css"), base / "index.ts", base / "index.tsx"]):
                errors.append(f"Import relativo quebrado: {code.relative_to(ROOT)} -> {target}")
    for py in BACK.rglob("*.py"):
        try: ast.parse(py.read_text(encoding="utf-8"), filename=str(py))
        except SyntaxError as exc:errors.append(f"Sintaxe Python: {py}: {exc}")
    for path in [BACK / "api" / "library_api.py", BACK / "services" / "ytdlp_worker.py", BACK / "requirements.txt"]:
        if not path.exists(): errors.append(f"Arquivo importante ausente: {path}")
    if not errors:
        print("OK: imports relativos TS, CSS universal, caminhos organizados e sintaxe Python.")
        print("Atenção: execute também npm run build e teste Flask/SQLite/áudio no Windows.")
    else:
        for problem in errors:print("ERRO:",problem)
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(check())

"""Validação offline do pacote para GitHub Releases, sem acessar chaves privadas.

Garante consistência de nomes, versão, assinatura e URL HTTPS antes de permitir
publicação. A validação criptográfica da assinatura é feita pelo Tauri Updater
no computador do usuário.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def validate_release_bundle(folder: Path, feed_path: Path, version: str, stable: bool = False) -> dict:
    if not re.fullmatch(r"2\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
        raise ValueError("Versão do BZtune inválida.")
    if stable and not re.fullmatch(r"2\.\d+\.\d+", version):
        raise ValueError("Publicação oficial exige uma versão estável, sem sufixo RC.")

    installer_name = f"BZtune-Setup-v{version}-x64.exe"
    installer = folder / installer_name
    signature_file = folder / (installer_name + ".sig")
    if not installer.is_file() or installer.stat().st_size == 0:
        raise ValueError("Instalador exato não encontrado ou vazio.")
    if not signature_file.is_file():
        raise ValueError("Assinatura .sig do instalador ausente.")
    if sorted(x.name for x in folder.glob("BZtune-Setup-v*.exe")) != [installer_name]:
        raise ValueError("Pacote contém instaladores de versões diferentes.")

    signature = signature_file.read_text(encoding="utf-8").strip()
    if len(signature) < 40:
        raise ValueError("Assinatura ausente ou curta demais.")
    if not feed_path.is_file():
        raise ValueError("Manifesto latest.json não foi produzido.")
    try:
        manifest = json.loads(feed_path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Manifesto latest.json inválido.") from exc
    if not isinstance(manifest, dict) or manifest.get("version") != version:
        raise ValueError("Versão no manifesto não corresponde ao instalador.")
    platforms = manifest.get("platforms")
    if not isinstance(platforms, dict) or set(platforms) != {"windows-x86_64"}:
        raise ValueError("Plataformas no manifesto diferentes do Windows x64 esperado.")
    package = platforms["windows-x86_64"]
    expected_url = (
        f"https://github.com/BadZ7br/BZtune/releases/download/v{version}/{installer_name}"
    )
    if not isinstance(package, dict) or package.get("url") != expected_url:
        raise ValueError("URL do manifesto não aponta para o Release HTTPS e nome exato.")
    if package.get("signature") != signature:
        raise ValueError("Assinatura do manifesto não corresponde ao arquivo .sig.")

    return {
        "version": version,
        "installer": installer_name,
        "size_bytes": installer.stat().st_size,
        "platform": "windows-x86_64",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path)
    parser.add_argument("version")
    parser.add_argument("feed", type=Path)
    parser.add_argument("--stable", action="store_true", help="Exigir versão oficial sem sufixo RC")
    args = parser.parse_args()
    try:
        result = validate_release_bundle(args.folder, args.feed, args.version, args.stable)
    except (ValueError, OSError) as exc:
        parser.exit(1, f"Release bloqueado: {exc}\n")
    print(
        f"Pacote validado sem publicação: {result['installer']} "
        f"({result['size_bytes']} bytes, {result['platform']})."
    )


if __name__ == "__main__":
    main()

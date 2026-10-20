"""Validação estrutural e criptográfica do pacote de Release, sem chave privada.

Verifica o executável e o comentário autenticado Minisign contra a chave pública
esperada. A verificação do Tauri no cliente permanece obrigatória.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import os
import subprocess
import json
import re
from pathlib import Path


# Shared format validation, also used when preparing the signed application.
try:
    from prepare_signing import validate_public_key
except ModuleNotFoundError:
    from desktop.scripts.prepare_signing import validate_public_key


def public_key_bytes(value: str) -> bytes:
    if not isinstance(value, str):
        raise ValueError("Chave pública Tauri inválida.")
    normalized = validate_public_key(value)
    key_text = base64.b64decode(normalized, validate=True).decode("utf-8")
    return base64.b64decode(key_text.strip().splitlines()[1], validate=True)


def verify_installer(installer: Path, signature: str, public_key: str, version: str, require_signed_version: bool = False) -> None:
    key = public_key_bytes(public_key)
    try:
        lines = base64.b64decode(signature, validate=True).decode("utf-8").splitlines()
        if len(lines) != 4 or not lines[0].startswith("untrusted comment: ") or not lines[2].startswith("trusted comment: "):
            raise ValueError()
        signed = base64.b64decode(lines[1], validate=True)
        global_signature = base64.b64decode(lines[3], validate=True)
        if len(signed) != 74 or len(global_signature) != 64 or signed[:2] not in (b"Ed", b"ED"):
            raise ValueError()
    except (ValueError, UnicodeDecodeError, binascii.Error):
        raise ValueError("Assinatura Tauri/Minisign inválida.") from None
    if signed[2:10] != key[2:10]:
        raise ValueError("Assinatura não corresponde à chave pública esperada.")
    comment = lines[2][len("trusted comment: "):]
    payload = {
        "key": base64.b64encode(key[10:]).decode("ascii"),
        "signature": base64.b64encode(signed[10:]).decode("ascii"),
        "globalSignature": base64.b64encode(global_signature).decode("ascii"),
        "trustedComment": comment,
        "prehashed": signed[:2] == b"ED",
    }
    try:
        verified = subprocess.run(
            ["node", str(Path(__file__).with_name("verify_release_signature.mjs")), str(installer.resolve())],
            input=json.dumps(payload), text=True, capture_output=True, timeout=120, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise ValueError("Verificador criptográfico indisponível ou fora do prazo; publicação bloqueada.") from None
    if verified.returncode != 0 or verified.stdout.strip() != "verified":
        raise ValueError("Assinatura criptográfica inválida para o instalador ou comentário autenticado.")
    # Metadata only becomes trustworthy after verifying both Ed25519 signatures.
    versions = [field[len("version:"):] for field in comment.split("\t") if field.startswith("version:")]
    if not versions and require_signed_version:
        raise ValueError("Assinatura sem versão autenticada, exigida pela configuração do aplicativo.")
    if versions and (len(versions) != 1 or versions[0].removeprefix("v") != version):
        raise ValueError("Versão autenticada pela assinatura não corresponde ao manifesto.")


def validate_release_bundle(folder: Path, feed_path: Path, version: str, stable: bool = False, *, public_key: str | None = None, config_path: Path | None = None) -> dict:
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

    expected_key = public_key if public_key is not None else os.environ.get("BZTUNE_UPDATER_PUBLIC_KEY", "")
    key = public_key_bytes(expected_key)
    require_signed_version = False
    if config_path is not None:
        try:
            config = json.loads(config_path.read_text(encoding="utf-8"))
            updater = config["plugins"]["updater"]
            configured_key = public_key_bytes(updater["pubkey"])
            require_signed_version = updater.get("requireSignedVersion", False)
            if not isinstance(require_signed_version, bool):
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise ValueError("Configuração da chave pública do aplicativo inválida.") from None
        if configured_key != key:
            raise ValueError("Chave pública do aplicativo difere da chave esperada para a publicação.")
    verify_installer(installer, signature, expected_key, version, require_signed_version)

    return {
        "version": version,
        "installer": installer_name,
        "size_bytes": installer.stat().st_size,
        "platform": "windows-x86_64",
        "signature_verified": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path)
    parser.add_argument("version")
    parser.add_argument("feed", type=Path)
    parser.add_argument("--stable", action="store_true", help="Exigir versão oficial sem sufixo RC")
    parser.add_argument("--config", type=Path, default=Path(__file__).resolve().parents[1] / "src-tauri" / "tauri.conf.json",
                        help="Configuração efetivamente usada no build; deve conter a chave pública esperada")
    args = parser.parse_args()
    try:
        result = validate_release_bundle(args.folder, args.feed, args.version, args.stable, config_path=args.config)
    except (ValueError, OSError) as exc:
        parser.exit(1, f"Release bloqueado: {exc}\n")
    print(
        f"Pacote e assinatura criptográfica validados sem publicação: {result['installer']} "
        f"({result['size_bytes']} bytes, {result['platform']})."
    )


if __name__ == "__main__":
    main()

"""Prepara Tauri Updater com a chave pública gerada pelo CLI (Base64).

Nunca lê, imprime, salva ou modifica a chave privada.
"""
from __future__ import annotations

import base64
import binascii
import json
import os
import re
import sys
from pathlib import Path


def validate_public_key(value: str) -> str:
    """Valida o formato real de `.pub` do Tauri 2 (minisign em Base64).

    O Tauri CLI salva o arquivo .pub com Base64 do bloco minisign de duas
    linhas. O plugin updater também espera esse conteúdo codificado.
    """
    value = value.strip()
    try:
        decoded = base64.b64decode(value, validate=True).decode("utf-8")
        lines = decoded.strip().splitlines()
        if len(lines) != 2 or not lines[0].startswith("untrusted comment: "):
            raise ValueError("bloco minisign incorreto")
        key_bytes = base64.b64decode(lines[1], validate=True)
        # Algoritmo (2 bytes), ID (8 bytes) e chave pública Ed25519 (32 bytes).
        if len(key_bytes) != 42 or key_bytes[:2] not in (b"Ed", b"ED"):
            raise ValueError("dados da chave pública incorretos")
    except (UnicodeDecodeError, ValueError, binascii.Error) as exc:
        raise ValueError(
            "Chave pública Tauri inválida: confira o conteúdo integral do arquivo .key.pub "
            "gerado pelo 'tauri signer generate' (formato Base64). "
            "Nunca forneça a chave privada."
        ) from None
    return value


def prepare() -> None:
    path = Path(__file__).resolve().parents[1] / "src-tauri" / "tauri.conf.json"
    version = os.environ["BZTUNE_RELEASE_VERSION"].strip()
    if not re.fullmatch(r"2\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
        raise SystemExit("Versão inválida.")

    try:
        public_key = validate_public_key(os.environ.get("BZTUNE_UPDATER_PUBLIC_KEY", ""))
    except ValueError as exc:
        raise SystemExit(str(exc)) from None

    config = json.loads(path.read_text(encoding="utf-8"))
    config["version"] = version
    config["bundle"]["createUpdaterArtifacts"] = True
    config["plugins"]["updater"]["pubkey"] = public_key

    # Isolated RC1 -> RC2 / RC3 -> RC4 end-to-end tests only. Production never uses HTTP.
    local_update_test = os.environ.get("BZTUNE_LOCAL_UPDATE_TEST", "").strip()
    if local_update_test not in ("", "0", "1"):
        raise SystemExit("BZTUNE_LOCAL_UPDATE_TEST deve ser 0 ou 1.")
    if local_update_test == "1":
        if version not in ("2.0.0-rc.1", "2.0.0-rc.2", "2.0.0-rc.3", "2.0.0-rc.4"):
            raise SystemExit("Atualização local permitida somente nas versões RC1-RC4 de teste.")
        config["plugins"]["updater"]["endpoints"] = [
            "http://127.0.0.1:8765/latest.json"
        ]
        config["plugins"]["updater"]["dangerousInsecureTransportProtocol"] = True
        print("AVISO: build isolado de teste RC; updater HTTP limitado ao loopback.")
    else:
        config["plugins"]["updater"].pop("dangerousInsecureTransportProtocol", None)
        if any(not url.startswith("https://") for url in config["plugins"]["updater"]["endpoints"]):
            raise SystemExit("Release normal exige endpoints HTTPS.")

    cargo = path.parent / "Cargo.toml"
    code = cargo.read_text(encoding="utf-8")
    revised, count = re.subn(
        r'(?m)^version = "[^"]+"',
        f'version = "{version}"',
        code,
        count=1,
    )
    if count != 1:
        raise SystemExit("Cargo.toml sem versão do pacote; nenhuma configuração alterada.")
    path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    cargo.write_text(revised, encoding="utf-8")
    print("Configuração do release preparada com chave pública Tauri válida.")


if __name__ == "__main__":
    if sys.argv[1:] == ["--check-public-key"]:
        try:
            validate_public_key(os.environ.get("BZTUNE_UPDATER_PUBLIC_KEY", ""))
        except ValueError as exc:
            raise SystemExit(str(exc)) from None
        print("Formato da chave pública Tauri validado; nenhum arquivo alterado.")
    elif len(sys.argv) > 1:
        raise SystemExit("Argumentos inválidos.")
    else:
        prepare()

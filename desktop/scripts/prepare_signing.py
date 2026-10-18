"""Injeta dados de release no Tauri config do runner; nunca inclui chave privada."""
import json
import os
import re
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src-tauri" / "tauri.conf.json"
config = json.loads(path.read_text(encoding="utf-8"))
version = os.environ["BZTUNE_RELEASE_VERSION"].strip()
public_key = os.environ["BZTUNE_UPDATER_PUBLIC_KEY"].strip()
if not re.fullmatch(r"2\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
    raise SystemExit("Versão inválida.")
if "untrusted comment:" not in public_key or len(public_key) < 70:
    raise SystemExit("Chave pública Tauri ausente ou inválida.")
config["version"] = version
config["bundle"]["createUpdaterArtifacts"] = True
config["plugins"]["updater"]["pubkey"] = public_key
path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
cargo = path.parent / "Cargo.toml"
code = cargo.read_text(encoding="utf-8")
code = re.sub(r'(?m)^version = "[^"]+"', f'version = "{version}"', code, count=1)
cargo.write_text(code, encoding="utf-8")
print("Configuração do release preparada.")

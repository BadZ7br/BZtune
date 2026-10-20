"""Validate an explicit, reviewed release request committed to protected main.

Only public metadata is read. Signing keys remain in the protected GitHub job.
"""
from __future__ import annotations

import json
from pathlib import Path
import re
import tomllib


def read_request(root: Path) -> dict[str, str]:
    request = json.loads((root / 'desktop/release-request.json').read_text(encoding='utf-8'))
    if not isinstance(request, dict):
        raise ValueError('Pedido de publicação inválido.')
    version = request.get('version')
    if not isinstance(version, str) or not re.fullmatch(r'2\.\d+\.\d+', version):
        raise ValueError('A publicação automática exige uma versão estável 2.x.y.')
    if request.get('publish') is not True or request.get('confirmation') != f'PUBLICAR v{version}':
        raise ValueError('Publicação exige publish=true e confirmação exata da versão.')

    config = json.loads((root / 'desktop/src-tauri/tauri.conf.json').read_text(encoding='utf-8'))
    package = json.loads((root / 'desktop/package.json').read_text(encoding='utf-8'))
    node_lock = json.loads((root / 'desktop/package-lock.json').read_text(encoding='utf-8'))
    cargo = tomllib.loads((root / 'desktop/src-tauri/Cargo.toml').read_text(encoding='utf-8'))
    cargo_lock = tomllib.loads((root / 'desktop/src-tauri/Cargo.lock').read_text(encoding='utf-8'))
    locked = [item['version'] for item in cargo_lock.get('package', []) if item.get('name') == 'bztune-desktop']
    versions = [config.get('version'), package.get('version'), node_lock.get('version'),
                node_lock.get('packages', {}).get('', {}).get('version'), cargo['package']['version'], *locked]
    if len(locked) != 1 or any(value != version for value in versions):
        raise ValueError('Pedido, configuração e locks precisam usar a mesma versão.')
    return {'version': version, 'publish': 'true', 'confirmation': f'PUBLICAR v{version}'}


if __name__ == '__main__':
    try:
        result = read_request(Path(__file__).resolve().parents[2])
    except (ValueError, KeyError, OSError) as error:
        raise SystemExit(str(error)) from None
    print(json.dumps(result))

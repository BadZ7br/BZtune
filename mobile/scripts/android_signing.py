"""Prepare a private preview keystore and verify public signing identity. Never logs secrets."""
from __future__ import annotations
import argparse
import base64
import hashlib
import os
from pathlib import Path
import re
import subprocess

ALIAS = 'bztune-preview'


def fingerprint(value: str) -> str:
    result = value.replace(':', '').strip().lower()
    if not re.fullmatch('[0-9a-f]{64}', result):
        raise ValueError('Certificado SHA-256 inválido; use o valor público emitido pelo gerador.')
    return result


def certificate(keystore: Path, env: dict[str, str], keytool='keytool') -> str:
    result = subprocess.run([keytool, '-exportcert', '-alias', ALIAS, '-keystore', str(keystore),
                             '-storepass:env', 'BZTUNE_ANDROID_STORE_PASSWORD'],
                            env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode or not result.stdout:
        raise ValueError('Não foi possível abrir a chave. Confira keystore, senha e alias bztune-preview.')
    return hashlib.sha256(result.stdout).hexdigest()


def prepare(destination: Path, env: dict[str, str], keytool='keytool') -> str | None:
    raw = env.get('BZTUNE_ANDROID_KEYSTORE_BASE64', '')
    password = env.get('BZTUNE_ANDROID_STORE_PASSWORD', '')
    expected = env.get('BZTUNE_ANDROID_CERT_SHA256', '')
    if not any([raw, password, expected]):
        return None
    if not all([raw, password, expected]):
        raise ValueError('Assinatura incompleta: configure os dois secrets e a variável SHA-256. Sem fallback debug.')
    expected = fingerprint(expected)
    try:
        content = base64.b64decode(''.join(raw.split()), validate=True)
    except (ValueError, TypeError):
        raise ValueError('Keystore Base64 inválido.') from None
    if not 100 <= len(content) <= 100_000:
        raise ValueError('Tamanho do keystore inválido.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise ValueError('Arquivo de assinatura já existe; não será sobrescrito.')
    # Exclusive creation, including restrictive permissions before the first byte is written.
    with destination.open('xb') as file:
        os.chmod(destination, 0o600)
        file.write(content)
    try:
        actual = certificate(destination, env, keytool)
        if actual != expected:
            raise ValueError('Certificado diferente do SHA-256 configurado. Publicação bloqueada.')
        return actual
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def verify_apk(apk: Path, expected: str, apksigner='apksigner') -> str:
    expected = fingerprint(expected)
    result = subprocess.run([apksigner, 'verify', '--print-certs', str(apk)],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode:
        raise ValueError('Assinatura do APK inválida.')
    signers = re.findall(r'^(?:Signer #\d+|V\d+(?:\.\d+)? Signer:)\s+certificate SHA-256 digest:\s*([a-fA-F0-9]{64})$', result.stdout, re.MULTILINE)
    if not signers or {fingerprint(value) for value in signers} != {expected}:
        raise ValueError('O APK não foi assinado pelo certificado Android esperado.')
    return expected


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare', type=Path)
    parser.add_argument('--verify', type=Path)
    parser.add_argument('--apksigner', default='apksigner')
    args = parser.parse_args()
    try:
        if args.prepare:
            actual = prepare(args.prepare, dict(os.environ))
            stable = actual is not None
            if output := os.environ.get('GITHUB_OUTPUT'):
                with open(output, 'a', encoding='utf8') as file:
                    file.write(f'stable={str(stable).lower()}\nkeystore={args.prepare.resolve() if stable else ""}\n')
            print('Assinatura estável preparada. SHA-256 público: '+actual if stable else 'Build debug descartável; assinatura estável ainda não configurada.')
        elif args.verify:
            actual = verify_apk(args.verify, os.environ.get('BZTUNE_ANDROID_CERT_SHA256', ''), args.apksigner)
            print('APK conferido com o certificado esperado: '+actual)
        else:
            parser.error('Informe --prepare ou --verify.')
    except ValueError as error:
        raise SystemExit(str(error)) from None

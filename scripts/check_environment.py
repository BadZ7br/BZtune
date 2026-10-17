"""Checa comandos usados pelo BZtune; não modifica o sistema."""
from __future__ import annotations
import shutil
import subprocess
from pathlib import Path

for cmd,args in [('node',['--version']),('npm',['--version']),('python',['--version']),('ffmpeg',['-version']),('ffprobe',['-version']),('git',['--version'])]:
    found=shutil.which(cmd)
    if not found:print(f'[FALTANDO] {cmd}')
    else:
        try:
            proc=subprocess.run([cmd,*args],capture_output=True,text=True,timeout=6,check=False)
            msg=(proc.stdout or proc.stderr).splitlines()
            print(f'[OK] {cmd} - '+(msg[0] if msg else found))
        except (OSError,subprocess.TimeoutExpired):print(f'[ERRO] {cmd}: verifique a instalação')

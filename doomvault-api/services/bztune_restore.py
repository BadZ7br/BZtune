#!/usr/bin/env python3
"""Restauração offline segura do BZtune. Exige --apply; nunca mexe no áudio sem confirmação.

Exemplo:
  python scripts/restaurar_bztune.py --project-root . --zip BZtune-Backup.zip
  python scripts/restaurar_bztune.py --project-root . --zip BZtune-Backup.zip --apply
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import socket
import sqlite3
import tempfile
import time
import zipfile

MAX_FILES=100_000
MAX_BYTES=12*1024**3
ALLOWED=("audio/","covers/","playlist_covers/")
EXTENSIONS={".mp3",".flac",".jpg",".jpeg",".png",".webp"}


def hashfile(path: Path) -> str:
    digest=hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda:stream.read(1024*1024),b""):
            digest.update(part)
    return digest.hexdigest()


def is_safe_name(name: str) -> bool:
    parts=PurePosixPath(name)
    return bool(name) and name==str(parts) and not name.startswith("/") and ".." not in parts.parts and "\\" not in name and ":" not in name


def validate_zip(archive: zipfile.ZipFile) -> dict:
    infos=[x for x in archive.infolist() if not x.is_dir()]
    if len(infos)>MAX_FILES+1:raise ValueError("Quantidade excessiva de arquivos")
    names=set();total=0
    for x in infos:
        if not is_safe_name(x.filename) or x.filename in names:raise ValueError("Caminho inválido ou repetido no ZIP")
        if x.filename not in ("manifest.json","library.sqlite3") and not (x.filename.startswith(ALLOWED) and PurePosixPath(x.filename).suffix.lower() in EXTENSIONS):
            raise ValueError("Arquivo inesperado: "+x.filename)
        names.add(x.filename);total+=x.file_size
        if total>MAX_BYTES:raise ValueError("Backup acima do limite")
        if x.compress_size and x.file_size>max(256*1024*1024,x.compress_size*500):
            raise ValueError("Compressão suspeita")
    if "manifest.json" not in names or "library.sqlite3" not in names:raise ValueError("Backup incompleto")
    manifest=json.loads(archive.read("manifest.json"))
    if manifest.get("format")!="bztune-library-backup-v1":raise ValueError("Formato de backup incompatível")
    members=manifest.get("members")
    if not isinstance(members,list) or {x.get("path") for x in members if isinstance(x,dict)}!=names-{"manifest.json"}:
        raise ValueError("Manifesto não corresponde ao conteúdo")
    return manifest


def restore(zip_path: Path, project_root: Path, apply: bool=False, *, library_dir: Path | None = None) -> dict:
    project_root=project_root.resolve()
    api_dir=project_root/"doomvault-api"
    if library_dir is None and (not (api_dir/"app.py").is_file() or not (project_root/"doomvault"/"package.json").is_file()):
        raise ValueError("Pasta do BZtune não reconhecida")
    base=Path(library_dir) if library_dir is not None else api_dir/"doomvault_library"
    api_dir=base.parent
    api_dir.mkdir(parents=True,exist_ok=True)
    if base.is_symlink():raise ValueError("Biblioteca é link simbólico; restauração bloqueada")
    zip_path=zip_path.resolve()
    if not zip_path.is_file():raise FileNotFoundError(zip_path)
    with zipfile.ZipFile(zip_path) as archive:
        # Same strict validation for exports, staging, CLI and packaged desktop.
        from services.bztune_backup import inspect_backup
        inspect_backup(zip_path, verify_hashes=True)
        manifest=validate_zip(archive)
        members=manifest["members"]
        result={"files":len(members),"createdAt":manifest.get("createdAt"),"destination":str(base),"willApply":apply}
        if not apply:return result
        # Verifica que a API está encerrada antes de tocar no banco SQLite.
        deadline = time.monotonic() + 5
        while True:
            with socket.socket() as sock:
                sock.settimeout(.3)
                occupied = sock.connect_ex(("127.0.0.1",5000)) == 0
            if not occupied:
                break
            if time.monotonic() >= deadline:
                raise RuntimeError("O serviço local ainda está em execução. Feche-o antes de restaurar.")
            time.sleep(.1)
        if shutil.disk_usage(api_dir).free < sum(int(x["size"]) for x in members)+100*1024*1024:
            raise RuntimeError("Espaço livre insuficiente para preparar a restauração")
        staging=Path(tempfile.mkdtemp(prefix="bztune_restore_",dir=api_dir))
        try:
            for item in members:
                name=item["path"]
                if not is_safe_name(name):raise ValueError("Caminho inseguro")
                target=staging.joinpath(*PurePosixPath(name).parts)
                target.parent.mkdir(parents=True,exist_ok=True)
                digest=hashlib.sha256();size=0
                with archive.open(name) as src,target.open("wb") as dst:
                    while data:=src.read(1024*1024):
                        digest.update(data);size+=len(data);dst.write(data)
                if size!=item["size"] or digest.hexdigest()!=item["sha256"]:
                    raise ValueError("Arquivo não passou na verificação: "+name)
            dbpath=staging/"library.sqlite3"
            if not dbpath.is_file():raise ValueError("SQLite ausente")
            db=sqlite3.connect(dbpath)
            try:
                if db.execute("PRAGMA integrity_check").fetchone()[0]!="ok":raise ValueError("SQLite corrompido")
            finally: db.close()
            backups=(base.parent if library_dir is not None else project_root)/"bztune-user-backups"
            backups.mkdir(exist_ok=True)
            backup=backups/("doomvault_library_"+dt.datetime.now().strftime("%Y%m%d_%H%M%S_%f"))
            old_existed=base.exists()
            if old_existed:os.replace(base,backup)
            try:
                os.replace(staging,base)
            except Exception:
                if old_existed and backup.exists():os.replace(backup,base)
                raise
            result["backupAnterior"]=str(backup) if old_existed else None
            result["restored"]=True
            return result
        finally:
            if staging.exists():shutil.rmtree(staging,ignore_errors=True)


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


def restore(zip_path: Path, project_root: Path, apply: bool=False) -> dict:
    project_root=project_root.resolve()
    api_dir=project_root/"doomvault-api"
    if not (api_dir/"app.py").is_file() or not (project_root/"doomvault"/"package.json").is_file():
        raise ValueError("Pasta do BZtune não reconhecida")
    base=api_dir/"doomvault_library"
    if base.is_symlink():raise ValueError("Biblioteca é link simbólico; restauração bloqueada")
    zip_path=zip_path.resolve()
    if not zip_path.is_file():raise FileNotFoundError(zip_path)
    with zipfile.ZipFile(zip_path) as archive:
        manifest=validate_zip(archive)
        members=manifest["members"]
        result={"files":len(members),"createdAt":manifest.get("createdAt"),"destination":str(base),"willApply":apply}
        if not apply:return result
        # Verifica que a API está encerrada antes de tocar no banco SQLite.
        with socket.socket() as sock:
            sock.settimeout(.3)
            if sock.connect_ex(("127.0.0.1",5000))==0:
                raise RuntimeError("A porta 5000 está ocupada. Feche o Flask antes de restaurar.")
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
            backups=project_root/"bztune-user-backups"
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


def main():
    parser=argparse.ArgumentParser(description="Restaura um backup completo do BZtune com Flask desligado")
    parser.add_argument("--project-root",required=True,type=Path,help="Pasta com doomvault e doomvault-api")
    parser.add_argument("--zip",required=True,type=Path,help="Caminho do ZIP de backup")
    parser.add_argument("--apply",action="store_true",help="Aplica a restauração (sem esta flag, apenas simula)")
    args=parser.parse_args()
    try:
        result=restore(args.zip,args.project_root,args.apply)
    except Exception as exc:
        parser.exit(1,f"RESTAURAÇÃO BLOQUEADA: {exc}\n")
    print(json.dumps(result,indent=2,ensure_ascii=False))
    if not args.apply:print("PRÉVIA OK. Use --apply somente depois de conferir o destino e fechar Flask.")

if __name__=="__main__":main()

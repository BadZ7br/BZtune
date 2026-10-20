"""Backup v1.7: snapshot consistente de SQLite + arquivos do usuário.

Restauração é preparada, não aplicada sobre o Flask em execução. O script
scripts/restaurar_bztune.py efetua a troca somente com Flask desligado.
"""
from __future__ import annotations

import hashlib
from contextlib import closing
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import tempfile
import time
import zipfile

from api.library_api import BASE, DB

FORMAT = "bztune-library-backup-v1"
ALLOWED_DIRS = ("audio/", "covers/", "playlist_covers/")
SAFE_EXTENSIONS = {".mp3", ".flac", ".jpg", ".jpeg", ".png", ".webp"}
MAX_UNCOMPRESSED = 12 * 1024**3
MAX_FILES = 100_000


def _sha256(path: Path) -> str:
    dig=hashlib.sha256()
    with path.open("rb") as inp:
        for chunk in iter(lambda:inp.read(1024*1024),b""):
            dig.update(chunk)
    return dig.hexdigest()


def _valid_relative(name: str) -> bool:
    p=PurePosixPath(name)
    return bool(name) and not name.startswith("/") and "\\" not in name and ":" not in name and ".." not in p.parts and name==str(p)


def _data_files():
    for folder in ("audio", "covers", "playlist_covers"):
        root=BASE/folder
        if not root.exists():
            continue
        for file in sorted(root.rglob("*")):
            if file.is_symlink() or not file.is_file():
                continue
            if file.suffix.lower() not in SAFE_EXTENSIONS:
                continue
            relative=file.relative_to(BASE).as_posix()
            if _valid_relative(relative):
                yield relative,file


def create_backup() -> tuple[Path, Path]:
    """Retorna (ZIP, pasta temporária): chamador remove quando terminar resposta."""
    tmp=Path(tempfile.mkdtemp(prefix="bztune_export_"))
    lock = None
    try:
        BASE.mkdir(parents=True, exist_ok=True)
        lock = sqlite3.connect(DB, timeout=15)
        lock.execute("BEGIN IMMEDIATE")
        db_snapshot=tmp/"library.sqlite3"
        BASE.mkdir(parents=True,exist_ok=True)
        with closing(sqlite3.connect(DB)) as source, closing(sqlite3.connect(db_snapshot)) as target:
            source.backup(target)
            target.commit()
        members=[("library.sqlite3",db_snapshot),*_data_files()]
        if len(members)>MAX_FILES:
            raise ValueError("Biblioteca contém arquivos demais para este backup")
        if sum(path.stat().st_size for _,path in members)>MAX_UNCOMPRESSED:
            raise ValueError("Backup maior que o limite de 12 GiB")
        manifest={"format":FORMAT,"createdAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
                  "members":[],"note":"Exporta SQLite e arquivos. As preferências do navegador são exportadas separadamente."}
        destination=tmp/"BZtune-Backup.zip"
        with zipfile.ZipFile(destination,"w",allowZip64=True) as archive:
            for name,path in members:
                info = zipfile.ZipInfo(name)
                info.compress_type = zipfile.ZIP_STORED if path.suffix.lower() in (".mp3", ".flac") else zipfile.ZIP_DEFLATED
                digest = hashlib.sha256()
                size = 0
                before = path.stat()
                with path.open("rb") as source, archive.open(info, "w", force_zip64=True) as target:
                    for chunk in iter(lambda: source.read(1024 * 1024), b""):
                        digest.update(chunk)
                        size += len(chunk)
                        target.write(chunk)
                after = path.stat()
                if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns) or size != before.st_size:
                    raise ValueError("Um arquivo mudou durante o backup. Tente novamente.")
                manifest["members"].append({"path":name,"size":size,"sha256":digest.hexdigest()})
            archive.writestr("manifest.json",json.dumps(manifest,ensure_ascii=False,indent=2))
        inspect_backup(destination, verify_hashes=True)
        return destination,tmp
    except Exception:
        shutil.rmtree(tmp,ignore_errors=True)
        raise
    finally:
        if lock is not None:
            lock.rollback()
            lock.close()


def inspect_backup(path: Path, verify_hashes: bool=True) -> dict:
    """Inspeciona somente nomes permitidos e hashes, recusando ZIP perigoso."""
    if not zipfile.is_zipfile(path):
        raise ValueError("Arquivo de backup ZIP inválido")
    with zipfile.ZipFile(path) as archive:
        entries=archive.infolist()
        if len(entries)>MAX_FILES+1:
            raise ValueError("Backup tem arquivos demais")
        names=set()
        total=0
        for info in entries:
            if info.is_dir():
                continue
            name=info.filename
            if not _valid_relative(name) or name in names:
                raise ValueError("Caminho inseguro ou duplicado no backup")
            names.add(name)
            if name not in ("manifest.json","library.sqlite3") and not (
                name.startswith(ALLOWED_DIRS) and PurePosixPath(name).suffix.lower() in SAFE_EXTENSIONS
            ):
                raise ValueError("Arquivo não permitido no backup")
            total+=info.file_size
            if total>MAX_UNCOMPRESSED:
                raise ValueError("Backup excede o limite de tamanho")
            if info.compress_size and info.file_size>max(256*1024*1024,info.compress_size*500):
                raise ValueError("Taxa de compressão suspeita")
        if "manifest.json" not in names or "library.sqlite3" not in names:
            raise ValueError("Backup incompleto")
        manifest=json.loads(archive.read("manifest.json"))
        if not isinstance(manifest,dict) or manifest.get("format")!=FORMAT:
            raise ValueError("Versão do backup não reconhecida")
        members=manifest.get("members")
        if not isinstance(members,list):
            raise ValueError("Manifesto inválido")
        if (len(members) != len(names) - 1 or any(not isinstance(x, dict) for x in members)
                or {x.get("path") for x in members if isinstance(x,dict)} != names-{"manifest.json"}):
            raise ValueError("Manifesto e conteúdo não correspondem")
        if verify_hashes:
            for item in members:
                if not isinstance(item,dict):
                    raise ValueError("Manifesto inválido")
                name=item["path"]
                if not _valid_relative(name):
                    raise ValueError("Nome inseguro")
                digest=hashlib.sha256()
                size=0
                with archive.open(name) as stream:
                    for part in iter(lambda:stream.read(1024*1024),b""):
                        digest.update(part)
                        size+=len(part)
                if digest.hexdigest()!=item.get("sha256") or size!=item.get("size"):
                    raise ValueError("Verificação de integridade falhou: "+name)
        # Confere que a cópia SQLite é um banco real e íntegro sem executar SQL nela.
        with tempfile.TemporaryDirectory(prefix="bztune_check_db_") as folder:
            dbpath=Path(folder)/"check.sqlite3"
            with archive.open("library.sqlite3") as inp,dbpath.open("wb") as out:
                shutil.copyfileobj(inp,out)
            with dbpath.open("rb") as dbfile:
                header = dbfile.read(16)
            if dbpath.stat().st_size<100 or header != b"SQLite format 3\x00":
                raise ValueError("Banco SQLite inválido")
            try:
                with closing(sqlite3.connect(dbpath.as_uri() + "?mode=ro", uri=True)) as db:
                    ok=db.execute("PRAGMA integrity_check").fetchone()[0]
                    columns = {row[1] for row in db.execute("PRAGMA table_info(tracks)")}
                    if "stored_name" in columns:
                        hashes = {x["path"]: x["sha256"] for x in members}
                        fields = "stored_name, sha256" if "sha256" in columns else "stored_name, NULL"
                        for filename, expected_hash in db.execute("SELECT " + fields + " FROM tracks"):
                            name = "audio/" + str(filename)
                            if not _valid_relative(name) or name not in names:
                                raise ValueError("Backup sem áudio referenciado pelo banco: " + str(filename))
                            if expected_hash and len(expected_hash) == 64 and hashes[name] != expected_hash:
                                raise ValueError("Áudio diverge do banco: " + str(filename))
            except sqlite3.DatabaseError as exc:
                raise ValueError("Banco SQLite corrompido") from exc
            if ok!="ok":
                raise ValueError("Banco SQLite corrompido")
    return {"ok":True,"createdAt":manifest.get("createdAt"),"files":len(members),"bytes":total,
            "containsAudio":any(x["path"].startswith("audio/") for x in members)}


def stage_backup(uploaded) -> dict:
    """Salva backup verificado para posterior restauração com servidor parado."""
    BASE.mkdir(parents=True,exist_ok=True)
    staging=BASE.parent/"bztune_restore_pending"
    staging.mkdir(parents=True,exist_ok=True)
    pending=staging/"pending.zip"
    descriptor, incoming = tempfile.mkstemp(prefix="incoming-", suffix=".tmp", dir=staging)
    os.close(descriptor)
    temp=Path(incoming)
    try:
        uploaded.save(temp)
        result=inspect_backup(temp,verify_hashes=True)
        checksum = _sha256(temp)
        os.replace(temp,pending)
        return {**result,"staged":True,"path":str(pending),"sha256":checksum,
                "next":"Pare o Flask antes de executar scripts/restaurar_bztune.py."}
    finally:
        temp.unlink(missing_ok=True)

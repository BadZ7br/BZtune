"""Recoverable directory swap. The lock is held by restore and startup recovery."""
import contextlib
import json
import os
from pathlib import Path
import time


def journal_path(base):
    return base.parent / ('.' + base.name + '.restore.json')


@contextlib.contextmanager
def library_lock(base, timeout=5):
    base = Path(base).absolute()
    base.parent.mkdir(parents=True, exist_ok=True)
    path = base.parent / ('.' + base.name + '.restore.lock')
    if path.is_symlink():
        raise ValueError('Bloqueio de restauração inválido')
    with path.open('a+b') as stream:
        stream.seek(0, 2)
        if stream.tell() == 0:
            stream.write(b'0'); stream.flush()
        until = time.monotonic() + timeout
        while True:
            try:
                stream.seek(0)
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() >= until:
                    raise RuntimeError('Uma restauração ainda controla a biblioteca. Aguarde e reinicie o aplicativo.')
                time.sleep(.05)
        try:
            yield
        finally:
            if os.name == 'nt':
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream, fcntl.LOCK_UN)


def _write(base, data):
    path = journal_path(base)
    temp = path.with_suffix('.tmp')
    if temp.is_symlink() or path.is_symlink():
        raise ValueError('Registro de restauração inválido')
    with temp.open('w', encoding='utf-8') as stream:
        json.dump(data, stream); stream.flush(); os.fsync(stream.fileno())
    os.replace(temp, path)


def recover(base):
    """Caller holds library_lock. Unknown or ambiguous states fail closed."""
    base = Path(base).absolute()
    path = journal_path(base)
    if not path.exists():
        return
    if path.is_symlink():
        raise ValueError('Registro de restauração inválido')
    data = json.loads(path.read_text(encoding='utf-8'))
    staging, backup = Path(data['staging']), Path(data['backup'])
    if (data.get('base') != str(base) or type(data.get('old')) is not bool
            or type(data.get('committed')) is not bool
            or staging.parent != base.parent or not staging.name.startswith('bztune_restore_')
            or backup.parent.name != 'bztune-user-backups'
            or backup.parent.parent not in base.parents
            or not backup.name.startswith('doomvault_library_')
            or any(p.is_symlink() for p in (base, staging, backup, backup.parent))):
        raise ValueError('Registro de restauração inconsistente; recuperação automática bloqueada')
    if data['committed']:
        if not base.is_dir():
            raise RuntimeError('Biblioteca confirmada ausente; preserve o backup para recuperação')
    elif data['old']:
        if backup.exists():
            if base.exists():
                if staging.exists():
                    raise RuntimeError('Estado ambíguo de restauração; arquivos preservados')
                os.replace(base, staging)
            os.replace(backup, base)
        elif not base.is_dir():
            raise RuntimeError('Biblioteca anterior não localizada; arquivos preservados')
    # Uncommitted staging is deliberately retained for inspection, never user audio deleted.
    path.unlink()


def install(staging, base, backup):
    if backup.exists() or backup.is_symlink():
        raise FileExistsError('O destino do backup anterior já existe; arquivos preservados')
    base = Path(base).absolute()
    data = dict(base=str(base), staging=str(staging.absolute()), backup=str(backup.absolute()),
                old=base.exists(), committed=False)
    _write(base, data)
    try:
        if data['old']:
            os.replace(base, backup)
        os.replace(staging, base)
        data['committed'] = True
        _write(base, data)
    except BaseException:
        recover(base)
        raise
    journal_path(base).unlink()

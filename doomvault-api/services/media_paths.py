"""Constrain database artwork references to direct children of their media folder."""
from pathlib import Path

IMAGE_EXTENSIONS = frozenset({'.jpg', '.jpeg', '.png', '.webp'})

def valid_cover_name(name):
    return (isinstance(name, str) and 0 < len(name) <= 255
            and name not in ('.', '..') and not any(c in name for c in '/\\:')
            and not any(ord(c) < 32 for c in name)
            and Path(name).suffix.lower() in IMAGE_EXTENSIONS)

def cover_path(folder, name):
    if not valid_cover_name(name):
        return None
    folder = Path(folder)
    try:
        path = folder / name
        if folder.is_symlink() or path.is_symlink():
            return None
        path.resolve().relative_to(folder.resolve())
        return path
    except (OSError, ValueError, RuntimeError):
        return None

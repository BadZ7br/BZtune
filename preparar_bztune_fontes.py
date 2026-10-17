"""Compatibilidade: use scripts/maintenance/preparar_bztune_fontes.py."""
from pathlib import Path
import runpy

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).resolve().parent / "scripts" / "maintenance" / "preparar_bztune_fontes.py"), run_name="__main__")

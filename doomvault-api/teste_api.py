"""Compatibilidade com diagnóstico anterior. Use scripts/diagnostics/teste_api.py."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts" / "diagnostics" / "teste_api.py"), run_name="__main__")

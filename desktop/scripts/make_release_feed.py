"""Prepara latest.json usando o instalador NSIS já assinado."""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

if len(sys.argv) not in (4, 5) or (len(sys.argv) == 5 and sys.argv[4] != "--local-loopback"):
    raise SystemExit("Uso: make_release_feed.py <pasta> <versão> <saída> [--local-loopback]")
local_loopback = len(sys.argv) == 5
folder = Path(sys.argv[1])
version = sys.argv[2]
output = Path(sys.argv[3])
if not re.fullmatch(r"2\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
    raise SystemExit("Versão inválida.")
installers = list(folder.glob("*-setup.exe"))
if len(installers) != 1:
    raise SystemExit("É necessário exatamente um instalador.")
if local_loopback and version not in ("2.0.0-rc.1", "2.0.0-rc.2"):
    raise SystemExit("Feed de teste local restrito a RC1/RC2.")
installer = installers[0]
sig = Path(str(installer) + ".sig")
if not sig.is_file():
    raise SystemExit("Assinatura obrigatória ausente.")
signature = sig.read_text(encoding="utf-8").strip()
if len(signature) < 40:
    raise SystemExit("Assinatura inválida.")
target = installer.with_name(f"BZtune-Setup-v{version}-x64.exe")
installer.rename(target)
sig.rename(Path(str(target) + ".sig"))
link = (
    f"http://127.0.0.1:8765/{target.name}"
    if local_loopback else
    f"https://github.com/BadZ7br/BZtune/releases/download/v{version}/{target.name}"
)
feed = {
    "version": version,
    "notes": f"BZtune Desktop {version}",
    "pub_date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "platforms": {"windows-x86_64": {"signature": signature, "url": link}},
}
output.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Feed latest.json preparado.")

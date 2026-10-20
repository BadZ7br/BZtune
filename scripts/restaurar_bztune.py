#!/usr/bin/env python3
"""Prévia e restauração offline da biblioteca web do BZtune."""
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "doomvault-api"))
from services.bztune_restore import restore

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

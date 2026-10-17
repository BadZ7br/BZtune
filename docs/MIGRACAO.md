# Migrar o projeto completo com segurança

1. No VS Code, confirme que está na branch esperada (`BadZ`) e que `git status` está limpo. Crie uma branch separada `refactor/estrutura-bztune`.
2. Encerre Flask e Vite para liberar `library.sqlite3`.
3. Faça uma cópia privada da pasta `doomvault-api/doomvault_library` fora do repositório.
4. Extraia o pacote e execute o instalador em modo prévia (`--dry-run`). **Não use `--force`.**
5. Rode o instalador apontando para a raiz que contém `doomvault` e `doomvault-api`.
6. Instale dependências do frontend (`npm ci`) e backend (`python -m pip install -r requirements.txt` num ambiente virtual).
7. Rode `npm run build`, `python -m compileall -q doomvault-api`, e os testes (`python -m unittest discover -s tests -v`).
8. Inicie Flask e Vite, depois teste álbuns, capas, pesquisa, downloads, playlists e mini-player/YouTube.
9. Confira `git diff` e registre um commit; não envie o diretório da biblioteca ou arquivos `.env`.

### Reversão

O instalador grava cópias dos arquivos substituídos e dos removidos em uma pasta de backup **fora da raiz do projeto** e imprime sua localização. Se surgir qualquer falha, encerre os servidores e restaure os arquivos do backup antes de iniciar outra instalação. O instalador não inclui nem remove a biblioteca musical local.

### Restaurar com o script do pacote

O ZIP também contém `desfazer_refatoracao.py`. Após parar Flask e Vite, informe a raiz do BZtune e o caminho da pasta de backup indicado pelo instalador:

```powershell
python desfazer_refatoracao.py "C:\CAMINHO\BZtune" "C:\CAMINHO\BZtune_backup_refatoracao_AAAAmmdd_HHMMSS"
```

O script só restaura automaticamente se os arquivos organizados ainda correspondem à versão instalada, evitando apagar alterações posteriores. A restauração não modifica a biblioteca local, os MP3, FLAC ou o banco SQLite. Faça um commit da reorganização somente após validar o projeto.

# Arquitetura BZtune (organização do código)

## Fluxo

- `doomvault/src/main.tsx` monta `App` e carrega **somente** `src/styles.css`.
- `doomvault/src/App.tsx` navega entre as telas organizadas em `src/pages/`.
- `src/player/` mantém o estado persistente (PlayerContext), áudio offline, YouTube IFrame, shuffle, repeat, crossfade e visual v1.3.3.
- `src/services/api.ts` consulta o Flask, enquanto `src/utils/music-utils.ts` converte e normaliza dados de faixas.
- `src/library/`, `src/playlists/` e `src/catalog/` concentram seus respectivos componentes e dados.
- `src/legacy/ApiAlbums.tsx` preserva a primeira tela do catálogo, não importada pelo aplicativo principal.

## Backend

- `doomvault-api/app.py` permanece como entrada Flask: `python app.py`.
- `doomvault-api/api/` contém os blueprints da biblioteca, downloads e playlists.
- `doomvault-api/services/` contém o processador yt-dlp e um serviço auxiliar de catálogo.
- Os módulos Python antigos na raiz do backend são **pequenos adaptadores de compatibilidade**.
- `doomvault-api/doomvault_library/` continua sendo o local da biblioteca SQLite, capas e MP3/FLAC. **Nunca versionar ou apagar este diretório**.
- `doomvault-api/cover_cache/` e `doomvault-api/doomvault_download_sources.json` continuam com o mesmo caminho de antes.

## CSS universal

`doomvault/src/styles.css` agrega as 22 folhas CSS recebidas, mantendo cada seção marcada pelo caminho de origem e preservando a ordem de carregamento analisada. Os imports CSS individuais foram removidos dos componentes. As regras repetidas não foram eliminadas automaticamente porque poderiam afetar a cascata; deduplicação deve ser tratada como outra alteração, depois da comparação visual.

## Persistência

O refactor não altera os esquemas das tabelas nem as chaves existentes do localStorage. Playlists, download de capas, banco, player híbrido e histórico devem continuar usando os mesmos dados.

## Limites da verificação

Teste de sintaxe, imports relativos, estrutura e CSS disponíveis offline; o build React e o funcionamento do Flask com os serviços reais devem ser validados no computador com as dependências instaladas.

O antigo `doomvault/LEIA-ME.txt` foi arquivado em `docs/legacy/` para referência histórica. O `package-lock.json` vazio da raiz foi removido; o lock verdadeiro continua em `doomvault/package-lock.json`.

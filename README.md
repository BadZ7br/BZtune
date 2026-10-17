# 🎵 BZtune

> **Estado do projeto (outubro de 2026):** a versão web v1.5.7.5 está na `main`. O Desktop v2.0 (Tauri + backend embutido) é desenvolvido separadamente em `feature/desktop-v2` e já gerou um instalador experimental no GitHub Actions, **mas ainda não possui release oficial**. A publicação pública está bloqueada até a auditoria e limpeza do histórico Git.

> **Organização do repositório:** a biblioteca local, caches de capas, bytecode Python, downloads e backups não devem ser versionados. Somente código, testes, recursos indispensáveis, documentação e automações são mantidos no Git. Antes de abrir o projeto ao público, é necessário remover também os arquivos antigos **do histórico de commits** — exclusões comuns não bastam.


Aplicativo musical independente para descoberta de artistas e álbuns, reprodução online (incorporação do YouTube) e offline, downloads/importações autorizadas, playlists mistas e organização da biblioteca local. Desenvolvido com **React + TypeScript + Vite** e **Python + Flask + SQLite**.

> **Versão de referência:** BZtune v1.3.3, reorganização estrutural. O código do player foi preservado; a estrutura de pastas foi atualizada.

## Funcionalidades

- Descoberta musical e discografias com YouTube Music e fontes alternativas de metadados/capas.
- Player híbrido: YouTube IFrame quando não há cópia local e HTML5 Audio para faixas offline.
- Mini-player, tela Agora tocando, Shuffle, Repeat, volume único, fila arrastável e crossfade opcional entre faixas locais.
- Biblioteca offline com capas por álbum, importação MP3/FLAC e detecção de duplicatas.
- Playlists com faixas online e offline, histórico e letras `.lrc` fornecidas pelo usuário.

## Pré-requisitos — Windows

1. **Git:** [git-scm.com/downloads/win](https://git-scm.com/downloads/win). Instale e confira `git --version`.
2. **Node.js LTS (com npm):** [nodejs.org/en/download](https://nodejs.org/en/download). Instale e confira `node -v` e `npm -v`.
3. **Python:** [python.org/downloads/windows](https://www.python.org/downloads/windows/). Instale com a opção de adicionar Python ao PATH (quando oferecida). Confira `python --version`.
4. **FFmpeg + FFprobe:** instruções em [ffmpeg.org/download.html](https://ffmpeg.org/download.html); no Windows também há os builds indicados em [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/). Adicione a pasta `bin` ao `PATH` e confira `ffmpeg -version` e `ffprobe -version`.

Depois de instalar ou alterar o PATH, reabra o terminal do VS Code.

## Instalar e iniciar

### Baixar o código

```powershell
git clone https://github.com/BadZ7br/BZtune.git
cd BZtune
```

Atenção: se a reorganização estiver numa branch ainda não integrada à `main`, execute `git switch refactor/estrutura-bztune` depois de baixar.

### Backend (terminal 1)

```powershell
cd doomvault-api
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

O Flask deve iniciar em `http://127.0.0.1:5000`.

### Frontend (terminal 2, na raiz do repositório)

```powershell
cd doomvault
npm ci
npm run build
npm run dev
```

Abra o endereço indicado pelo Vite, geralmente `http://localhost:5173`.

## Estrutura

```text
BZtune/
├── doomvault/                 # Frontend React/Vite
│   └── src/
│       ├── App.tsx
│       ├── pages/
│       ├── player/
│       ├── library/
│       ├── playlists/
│       ├── catalog/
│       ├── services/
│       ├── utils/
│       ├── legacy/
│       └── styles.css         # CSS universal
├── doomvault-api/             # Backend Flask
│   ├── app.py
│   ├── api/
│   ├── services/
│   └── requirements.txt
├── scripts/
├── tests/
├── docs/
└── README.md
```

## Dados pessoais

`doomvault-api/doomvault_library/` contém SQLite, faixas offline e capas e **não deve ser enviado ao GitHub**. Não apague nem substitua essa pasta. Repositório sincroniza código; dados pessoais precisam de backup separado.

## Diagnóstico e manutenção

```powershell
python scripts/verify_structure.py
python -m unittest discover -s tests -v
```

Veja [Arquitetura](docs/ARQUITETURA.md) e [Migração segura](docs/MIGRACAO.md).

## Integrações e limites

YouTube Music via `ytmusicapi` é uma integração não oficial. A reprodução online usa o player incorporado oficial, sujeito às permissões dos vídeos. Não há ligação oficial do BZtune com os provedores. Use downloads e importações apenas para conteúdos que possui direito de guardar. Licença ainda não definida.

# 🎵 BZtune

> **Estado do projeto (27/10/2026):** o BZtune Desktop está integrado na `main`, com Tauri 2 e backend iniciado pelo próprio aplicativo. A referência de versão publicada é **2.0.10**. Consulte [Releases](https://github.com/BadZ7br/BZtune/releases/latest) para a distribuição disponível; commits posteriores podem conter correções ainda não publicadas.

> **Organização e privacidade:** a biblioteca local, caches de capas, bytecode Python, downloads e backups não são versionados. O histórico deste repositório foi reconstruído e auditado antes de sua criação pública; o repositório anterior permanece como **backup privado separado**.


Aplicativo musical independente para descoberta de artistas e álbuns, reprodução online (incorporação do YouTube) e offline, downloads/importações autorizadas, playlists mistas e organização da biblioteca local. Desenvolvido com **React + TypeScript + Vite** e **Python + Flask + SQLite**.

O núcleo local está sendo migrado para **Rust/Tauri**. As operações de playlists já têm implementação nativa e usam comandos internos no desktop; as demais funções ainda usam o backend atual. Veja [escopo, compatibilidade e validação da migração](docs/NATIVE_MIGRATION.md).

> **Finalidade:** projeto didático e educacional para estudo e desenvolvimento de habilidades técnicas; não possui fins comerciais.

O histórico de versões está em [Releases](https://github.com/BadZ7br/BZtune/releases). A configuração de desenvolvimento usa uma chave provisória; o workflow de publicação injeta a chave real e gera os artefatos assinados.

## Funcionalidades

- Descoberta musical e discografias com YouTube Music e fontes alternativas de metadados/capas.
- Player híbrido: YouTube IFrame quando não há cópia local e HTML5 Audio para faixas offline.
- Mini-player, tela Agora tocando, Shuffle, Repeat, volume único, fila arrastável e crossfade opcional entre faixas locais.
- Biblioteca offline com capas por álbum, importação MP3/FLAC e detecção de duplicatas.
- Playlists com faixas online e offline, histórico, letras LRCLIB e importação `.lrc`.

## Instalar no Windows

1. Abra a [última Release](https://github.com/BadZ7br/BZtune/releases/latest) e baixe `BZtune-Setup-v<versão>-x64.exe` em **Assets**.
2. Execute o instalador e abra o BZtune pelo atalho. O aplicativo inicia e encerra o backend automaticamente.
3. Para atualizar, abra **Sistema → Atualizações**. Builds antigos de laboratório com feed local precisam de uma instalação manual da versão de produção; veja [migração do canal de atualizações](desktop/PRODUCTION_UPDATE_ROLLOUT.md).

O instalador inclui Python/Flask, FFmpeg e FFprobe. O usuário não precisa instalar Git, Node.js ou Rust nem iniciar terminais. Se o WebView2 estiver ausente, o instalador baixa o runtime Microsoft. Veja [detalhes e requisitos do instalador](desktop/INSTALLER_WINDOWS.md).

## Desenvolvimento a partir do código

Use a branch `main`. No Windows, instale Git, Node.js LTS, Python compatível com as dependências e FFmpeg/FFprobe no PATH. Para compilar o desktop, instale também [Rust e os pré-requisitos Windows do Tauri](https://v2.tauri.app/start/prerequisites/), incluindo as ferramentas C++ do Visual Studio.

```powershell
git clone https://github.com/BadZ7br/BZtune.git
cd BZtune
npm --prefix doomvault ci
npm --prefix desktop ci
```

### Aplicativo desktop (Windows)

Em um ambiente Python de desenvolvimento, prepare o backend empacotado e os recursos:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
.\desktop\scripts\prepare_windows.ps1
npm --prefix desktop run tauri -- dev
```

O comando Tauri inicia o Vite; o executável desktop gerencia o backend. A preparação usa PyInstaller e copia FFmpeg/FFprobe para os recursos do aplicativo. Reexecute a preparação após alterações Python. O script pode recorrer ao Chocolatey se essas ferramentas não estiverem no PATH.

Para gerar um instalador de desenvolvimento:

```powershell
npm --prefix desktop run tauri -- build --bundles nsis
```

O build local comum não publica uma atualização nem configura assinatura de produção. Consulte [publicação e assinatura](desktop/PRODUCTION_UPDATE_ROLLOUT.md).

### Interface no navegador (desenvolvimento opcional)

Para trabalhar apenas na interface/API, execute os processos de desenvolvimento em dois terminais:

```powershell
# Terminal 1, na raiz
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r doomvault-api/requirements.txt
.\.venv\Scripts\python.exe doomvault-api/app.py
```

```powershell
# Terminal 2, na raiz
npm --prefix doomvault run dev
```

A API usa `http://127.0.0.1:5000`; abra a URL indicada pelo Vite. Este modo serve para desenvolver e testar os componentes web.

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
├── desktop/                  # Launcher Tauri, núcleo Rust e pipeline Windows
├── scripts/
├── tests/
├── docs/
└── README.md
```

## Dados pessoais

No desktop instalado, os dados ficam em `%LOCALAPPDATA%\BZtune\library`. No desenvolvimento Python, o diretório padrão é `doomvault-api/doomvault_library/` (salvo configuração explícita). Eles contêm SQLite, faixas offline e capas e **não devem ser enviados ao GitHub**. Não apague nem substitua esses diretórios; mantenha backup separado dos dados pessoais.

## Diagnóstico e manutenção

```powershell
python scripts/verify_structure.py
python -m unittest discover -s tests -v
```

Veja [Arquitetura](docs/ARQUITETURA.md) e [Migração segura](docs/MIGRACAO.md).

## Integrações e limites

YouTube Music via `ytmusicapi` é uma integração não oficial. A reprodução online usa o player incorporado oficial, sujeito às permissões dos vídeos. Não há ligação oficial do BZtune com os provedores. Use downloads e importações apenas para conteúdos que possui direito de guardar. Licença ainda não definida.

## Colaboradores

- [BadZ7br](https://github.com/BadZ7br)
- [Julio2-3acerola](https://github.com/Julio2-3acerola)

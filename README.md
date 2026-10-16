# 🎵 BZtune

**Descubra artistas, explore discografias e organize sua própria biblioteca musical — online e offline.**

O **BZtune** (iniciado como *DoomVault*) é um projeto de aplicativo musical em desenvolvimento. Ele combina descoberta de músicas e álbuns, gerenciamento de arquivos locais, reprodução integrada e playlists em uma interface escura e minimalista.

> **Status:** projeto pessoal em desenvolvimento — versão de referência **v1.2.2**. Algumas funcionalidades e integrações podem depender da disponibilidade de serviços externos.

## ✨ Funcionalidades

- 🔎 **Busca musical:** pesquisa de artistas, músicas e lançamentos.
- 💿 **Páginas de álbuns e artistas:** exploração de faixas e discografias, incluindo identificação de artistas com nomes iguais quando o catálogo fornece IDs distintos.
- ▶️ **Reprodução online e offline:** player de arquivos locais e integração com o player incorporado do YouTube, quando permitida pela origem.
- 📥 **Biblioteca offline:** importação e gerenciamento de arquivos MP3/FLAC; ferramentas de download/processamento de mídia quando disponíveis e autorizadas.
- 🎨 **Capas e organização por álbum:** recuperação de arte, associação de faixas a álbuns e capas compartilhadas.
- 🎶 **Playlists mistas:** combinação de músicas do catálogo e da biblioteca local na mesma lista.
- 🔀 **Controles de reprodução:** fila, Shuffle, Repeat, mini-player, histórico e retomada de reprodução.
- 🎚️ **Recursos do player:** equalizador para áudio local e suporte à exibição de letras sincronizadas via arquivos `.lrc`.
- 🏠 **Navegação integrada:** página inicial, pesquisa e biblioteca em uma única aplicação.

As funcionalidades estão sendo aperfeiçoadas continuamente. A reprodução online depende das restrições e da disponibilidade de cada vídeo.

## 🛠️ Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Frontend | React, TypeScript, Vite, CSS, Lucide React |
| Backend | Python, Flask, Flask-CORS |
| Dados locais | SQLite |
| Catálogo e metadados | `ytmusicapi`, MusicBrainz e serviços de capas (conforme a integração disponível) |
| Áudio e metadados | HTML5 Audio, Web Audio API, FFmpeg/FFprobe, Mutagen |
| Processamento de mídia | `yt-dlp` |
| Comparação de textos | RapidFuzz |

## 📁 Estrutura do projeto

```text
BZtune/
├── doomvault/                  # Frontend React + TypeScript
│   ├── src/
│   │   ├── player/             # Contexto e interface do reprodutor
│   │   ├── library/            # Biblioteca local
│   │   ├── playlists/          # Gerenciamento de playlists
│   │   └── App.tsx
│   ├── package.json
│   └── package-lock.json
├── doomvault-api/              # API Python/Flask
│   ├── app.py
│   ├── library_api.py
│   ├── playlists_api.py
│   └── doomvault_library/      # Arquivos locais (não versionar)
├── .gitignore
└── README.md
```

A estrutura acima resume os componentes principais; outros módulos e arquivos auxiliares podem existir na versão atual.

## 🚀 Guia completo de instalação — Windows 10/11

Este guia foi pensado para quem **acabou de baixar o código** e ainda não tem os programas necessários. **Não precisa ter o VS Code instalado** para executar os comandos: o Terminal/PowerShell do Windows funciona também.

> **Antes de começar:** o BZtune ainda está em desenvolvimento e é executado localmente com **dois servidores** (Python/Flask e React/Vite). Não é um programa `.exe` pronto para abrir com dois cliques. Reserve alguns minutos para instalar os pré-requisitos. O Windows deve ser de 64 bits para os pacotes indicados.

### ✅ Visão geral dos pré-requisitos

| Programa | Para que serve | Onde baixar |
| --- | --- | --- |
| **Node.js LTS + npm** | Rodar a interface React/Vite | [nodejs.org/en/download](https://nodejs.org/en/download) |
| **Python** | Rodar a API Flask | [python.org/downloads/windows](https://www.python.org/downloads/windows/) |
| **Git** | Clonar o código e receber atualizações | [git-scm.com/downloads/win](https://git-scm.com/downloads/win) |
| **FFmpeg + FFprobe** | Processamento e conversão de arquivos de áudio | [ffmpeg.org/download.html](https://ffmpeg.org/download.html) / [builds para Windows](https://www.gyan.dev/ffmpeg/builds/) |
| **VS Code** (opcional) | Editar código e usar terminais integrados | [code.visualstudio.com/download](https://code.visualstudio.com/download) |

**Todos os programas listados têm opções gratuitas.** Não é necessário instalar `node_modules`, React, Vite ou bibliotecas Python manualmente por links separados: elas serão instaladas pelo gerenciador de pacotes nos próximos passos.

### Passo 1 — Instalar Node.js e npm

1. Entre em **https://nodejs.org/en/download**.
2. Escolha a versão **LTS** (suporte de longo prazo), para **Windows**, e baixe o **instalador `.msi`** adequado ao seu computador (geralmente x64).
3. Execute o instalador, avance com **Next**, aceite os termos e mantenha as opções padrão, incluindo a instalação do **npm**.
4. Conclua a instalação e **feche/reabra o VS Code ou PowerShell**.
5. Abra o PowerShell (`Win + X` → **Terminal** ou pesquise por **PowerShell**) e verifique:

```powershell
node --version
npm --version
```

Ambos devem exibir números de versão. Se `node` não for reconhecido, reinicie o terminal; se persistir, reinstale o Node.js verificando a opção de inclusão no **PATH**. Se o PowerShell bloquear `npm.ps1`, use **`npm.cmd`** em vez de `npm` nos comandos deste guia — não é necessário desativar as políticas de segurança.

### Passo 2 — Instalar Python

1. Entre em **https://www.python.org/downloads/windows/**.
2. Para manter compatibilidade com as dependências usadas durante o desenvolvimento, **Python 3.12 (64 bits)** é uma escolha conservadora. Procure um instalador tradicional dessa série ou use uma versão que esteja validada no projeto; nem toda biblioteca oferece suporte imediato às versões mais novas do Python.
3. Execute o instalador. Se ele mostrar a opção **Add python.exe to PATH**, marque-a antes de clicar em **Install Now**. As telas variam conforme a versão/gerenciador do Python.
4. Feche e reabra o terminal e confirme:

```powershell
python --version
python -m pip --version
```

Se `python` abrir a Microsoft Store ou não for encontrado, teste `py --version` e, se funcionar, substitua `python` por `py` **apenas na criação do ambiente virtual**. Se nenhum funcionar, revise a instalação e o PATH.

### Passo 3 — Instalar Git

1. Entre em **https://git-scm.com/downloads/win**.
2. Baixe o **Git for Windows** (instalador x64 para a maioria dos computadores).
3. Execute-o e mantenha as opções padrão. Na configuração de PATH, a opção para utilizar Git pela linha de comando do Windows deve estar habilitada.
4. Abra um terminal novo e confira:

```powershell
git --version
```

Se preferir instalar por um gerenciador do Windows, o comando alternativo é `winget install --id Git.Git -e --source winget` (quando o WinGet estiver disponível).

### Passo 4 — Instalar FFmpeg e FFprobe (importante)

O **FFmpeg não é uma biblioteca do pip**. O BZtune precisa que o Windows encontre os executáveis `ffmpeg.exe` e `ffprobe.exe`.

**Opção A — Instalar pelo WinGet (mais rápido):**

1. Abra o PowerShell.
2. Execute:

```powershell
winget install --id Gyan.FFmpeg -e --source winget
```

3. Depois de instalar, feche **completamente** o VS Code e abra novamente.
4. Teste:

```powershell
ffmpeg -version
ffprobe -version
```

> **Se aparecer `Access is denied` / `Acesso negado`**, como pode acontecer em alguns computadores Windows, use a instalação manual abaixo. Não precisa desativar antivírus ou proteções do Windows.

**Opção B — Instalar manualmente sem precisar de administrador:**

1. Abra **https://www.gyan.dev/ffmpeg/builds/**, que fornece builds para Windows indicadas pelo site do FFmpeg.
2. Na seção **release builds**, baixe **`ffmpeg-release-essentials.zip`** (arquivo `.zip`, não `.7z`). Ele contém o FFmpeg e o FFprobe.
3. No Explorador de Arquivos, clique no `.zip` → **Extrair tudo**.
4. Entre na pasta extraída e localize a subpasta **`bin`**, onde estão `ffmpeg.exe` e `ffprobe.exe`.
5. Copie a pasta extraída para um local permanente no seu perfil de usuário, por exemplo `C:\Users\SEU_USUARIO\AppData\Local\Programs\ffmpeg\`. O importante é que exista uma pasta **`bin`** com os dois executáveis.
6. No menu Iniciar, pesquise por **Editar as variáveis de ambiente da sua conta**.
7. Em **Variáveis de usuário**, selecione **Path** → **Editar** → **Novo**. Cole o **caminho completo da pasta `bin`** do passo anterior (use a opção **Copiar como caminho** no Explorador e retire as aspas, se houver).
8. Confirme todas as janelas com **OK**, feche e abra o VS Code/terminal e teste:

```powershell
ffmpeg -version
ffprobe -version
where.exe ffmpeg
where.exe ffprobe
```

Os comandos devem mostrar versões e caminhos para os dois programas. **Apenas adicionar a pasta do FFmpeg ao disco não basta:** é preciso que a pasta `bin` esteja no PATH, e que o **Flask seja reiniciado depois disso**.

### Passo 5 — Baixar o código do BZtune

Escolha uma pasta para seus projetos (por exemplo, **Documentos**) e abra o PowerShell nela. Execute:

```powershell
git clone https://github.com/BadZ7br/BZtune.git
cd BZtune
```

Se você **já baixou o ZIP pelo GitHub**, extraia-o e abra no terminal a pasta que contém **`doomvault`** e **`doomvault-api`**. Não precisa executar `git clone` de novo.

Sua estrutura deve se parecer com esta:

```text
BZtune/
├── doomvault/                 # Frontend
│   ├── package.json
│   └── src/
├── doomvault-api/             # Backend
│   └── app.py
└── README.md
```

> Se o projeto foi extraído numa pasta `BZtune/BZtune`, entre na **pasta interna**, aquela que contém `doomvault` e `doomvault-api`. Sempre confira sua pasta atual com `Get-Location` no PowerShell.

### Passo 6 — Configurar as dependências Python do backend

Abra o **primeiro terminal** na raiz do repositório e execute:

```powershell
cd doomvault-api
python -m venv .venv
```

O comando cria um ambiente Python isolado em `.venv`. Para evitar problemas com a política de execução do PowerShell, você **não precisa ativá-lo**: utilize o Python que fica dentro dele diretamente.

Atualize o gerenciador de pacotes:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
```

**Se existir o arquivo `requirements.txt`**, instale todas as dependências com:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

**Se o repositório ainda não tiver um `requirements.txt` revisado**, use temporariamente as dependências identificadas nas versões documentadas:

```powershell
.\.venv\Scripts\python.exe -m pip install flask flask-cors requests ytmusicapi yt-dlp mutagen rapidfuzz
```

> Algumas versões também podem precisar de bibliotecas extras, como `Pillow`. O comando acima cobre os pacotes principais conhecidos, **não é uma garantia de que não haja novos imports na versão atual**. O ideal é manter um `requirements.txt` completo e revisado no GitHub.

Inicie o backend:

```powershell
.\.venv\Scripts\python.exe app.py
```

Se estiver funcionando, aparecerá algo como `Running on http://127.0.0.1:5000`. **Deixe esse terminal aberto.**

### Passo 7 — Instalar o frontend e iniciar o Vite

Abra um **segundo terminal**, na pasta raiz do repositório, e execute:

```powershell
cd doomvault
npm ci
npm run dev
```

> Use `npm ci` quando existir `package-lock.json`. Se não existir, use `npm install` no lugar. Caso o PowerShell bloqueie `npm.ps1`, troque os comandos por `npm.cmd ci` e `npm.cmd run dev`.

O Vite deve mostrar uma URL local, normalmente **http://localhost:5173/**. Abra esse endereço no navegador.

Os dois terminais precisam continuar abertos:

| Terminal | Pasta | Comando |
| --- | --- | --- |
| 1 — API | `doomvault-api` | `.\.venv\Scripts\python.exe app.py` |
| 2 — interface | `doomvault` | `npm run dev` |

Para conferir se a interface compila antes de testar:

```powershell
npm run build
```

### Passo 8 — Verificação de funcionamento

- [ ] `node --version` e `npm --version` retornam versões.
- [ ] `python --version` funciona.
- [ ] `git --version` funciona (se você clonou com Git).
- [ ] `ffmpeg -version` e `ffprobe -version` funcionam.
- [ ] A API Flask está executando na porta `5000`.
- [ ] O Vite abriu no navegador na porta informada (geralmente `5173`).
- [ ] A pesquisa musical funciona com conexão à internet.
- [ ] A reprodução de um arquivo **local que você possui** funciona.
- [ ] Playlists e capas são carregadas corretamente.

**Atenção:** a biblioteca local e o SQLite do computador anterior **não são trazidos automaticamente pelo GitHub**; esses dados devem ser copiados/restaurados separadamente, com o app fechado. Nunca publique seus arquivos de áudio ou banco pessoal no repositório.

### 🧰 Solução de problemas comuns

| Erro | Causa provável | Como resolver |
| --- | --- | --- |
| `'vite' não é reconhecido` | Dependências do frontend ainda não instaladas. | Na pasta `doomvault`, execute `npm ci` (ou `npm install` se não houver lockfile) e depois `npm run dev`. |
| `npm.ps1 cannot be loaded` | Restrição de scripts do PowerShell. | Use `npm.cmd ci` e `npm.cmd run dev`, sem alterar as políticas de segurança. |
| `ModuleNotFoundError: No module named 'flask'` | Ambiente Python ainda sem as dependências. | Execute a instalação com `.\.venv\Scripts\python.exe -m pip ...` na pasta `doomvault-api`. |
| `ModuleNotFoundError: No module named 'rapidfuzz'` | Biblioteca ausente no ambiente virtual. | `.\.venv\Scripts\python.exe -m pip install rapidfuzz`. |
| `FFmpeg não encontrado no PATH` | Executável ausente ou PATH ainda desatualizado no processo Flask. | Verifique `where.exe ffmpeg` e `where.exe ffprobe`; corrija o PATH da pasta `bin` e reinicie o VS Code e o Flask. |
| `Access is denied` ao instalar FFmpeg via WinGet | Permissão negada pelo instalador. | Use a **Opção B** de instalação manual na pasta do seu usuário. |
| A interface abre, mas não carrega músicas | Backend não iniciado ou falha de rede/serviço. | Verifique o terminal Flask e o Console do navegador (`F12`), além da conexão à internet. |
| A biblioteca aparece vazia em outro PC | O GitHub não armazena músicas ou SQLite pessoais. | Importe seus arquivos locais ou restaure um backup da biblioteca. |
| `python` abre a Microsoft Store | Associação/alias do Windows ou Python não acessível pelo PATH. | Teste `py --version`; revise a instalação e os aliases de execução no Windows. |

### Atualizar o projeto posteriormente

Se você clonou o repositório usando Git, execute **na raiz**, antes de modificar o código:

```powershell
git status
git pull --ff-only origin main
```

Se o Git informar alterações locais, **não descarte arquivos nem use `git reset --hard`**: salve o trabalho antes de atualizar. Em caso de alterações nas dependências, execute novamente `npm ci` e a instalação do `requirements.txt` atualizado.

## 🌐 APIs e serviços externos

| Serviço | Finalidade | Observações |
| --- | --- | --- |
| YouTube Music (`ytmusicapi`) | Pesquisa e catálogo musical | Biblioteca não oficial; mudanças no serviço podem afetar a integração. |
| YouTube IFrame Player API | Reprodução online incorporada | Alguns vídeos não permitem incorporação; é necessário respeitar as regras da plataforma. |
| iTunes Search API | Fonte alternativa de metadados e capas | Disponibilidade de resultados varia. |
| MusicBrainz / Cover Art Archive | Identificação de lançamentos e arte de capas | Integrações e fontes alternativas podem variar conforme a versão do código. |

Não é necessário configurar uma integração com o Spotify para as funcionalidades aqui descritas.

## 💾 Armazenamento e privacidade

O BZtune utiliza armazenamento local para biblioteca musical, capas e dados de playlists. A pasta `doomvault-api/doomvault_library/` e bancos SQLite locais **não devem ser enviados ao GitHub**.

Antes de publicar alterações, confira:

```powershell
git status
git ls-files | Select-String "doomvault_library|\.mp3|\.flac|\.sqlite3|\.env|\.venv"
```

O ideal é que o segundo comando não encontre arquivos pessoais ou segredos. O `.gitignore` **não remove arquivos já presentes no histórico do Git**. Faça backups antes de migrar dados ou instalar atualizações.

## 🧭 Roadmap

### v1.3 — Music Experience (planejada)

- [ ] Fila de reprodução reorganizável por arrastar e soltar.
- [ ] Atalhos de teclado para Play/Pause e navegação.
- [ ] Controles globais de volume e mute.
- [ ] Crossfade opcional entre músicas locais.
- [ ] Maior estabilidade na alternância entre fontes online/offline.
- [ ] Tela **Agora tocando** com capa grande.

### Ideias futuras

- [ ] Backup e restauração de biblioteca e playlists entre computadores.
- [ ] Estatísticas de reprodução e recomendações personalizadas.
- [ ] Empacotamento como aplicativo Windows e, futuramente, Android.

## 🤝 Contribuições

Sugestões, relatórios de bugs e melhorias são bem-vindos pelas **Issues** do GitHub. Para mudanças no código, prefira uma branch separada e valide o frontend com `npm run build` antes de abrir um pull request.

## ⚖️ Uso responsável

Este é um projeto independente, não afiliado ao YouTube, YouTube Music, Apple, MusicBrainz ou aos artistas citados. Utilize recursos de importação, reprodução e processamento apenas com conteúdo que você tenha direito de acessar e usar, respeitando os termos dos serviços e os direitos autorais.

**Licença:** ainda não definida. Até que seja adicionada uma licença ao repositório, não presuma que o código esteja autorizado para redistribuição ou reutilização fora dos termos legais aplicáveis.

---

Feito com **React, TypeScript e Python**, como projeto de aprendizado e portfólio.

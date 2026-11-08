# Auditoria do BZtune Desktop — 08/11/2026

Revisão do commit `030af34`, versão de referência desktop **2.0.12**. Nenhuma correção de produto, exclusão, atualização de dependências ou publicação foi feita nesta auditoria. Os arquivos criados são o relatório e suas evidências. Arquivos pessoais e relatórios anteriores foram preservados.

## Resultado principal

Há código desnecessário e redundância que podem ser reduzidos, mas **não recomendo uma exclusão em massa**. O problema prioritário é a validação JavaScript do desktop: a extração recente do parser de letras para o módulo compartilhado deixou os carregadores de duas suítes incompatíveis. A suíte oficial executada neste checkout falha. Também reproduzi um erro HTTP 500 no endpoint de capas diante de URLs malformadas.

A compilação de produção passa, inclusive em cópia limpa usando o lockfile. Os testes Python e do núcleo Rust passam. Os resultados dos fluxos de navegador estão registrados na matriz adiante. Isso é evidência de preservação dos cenários examinados, **não uma garantia de que toda funcionalidade funciona em qualquer computador Windows**.

## Escopo e método

Foram inventariados e examinados automaticamente **117 arquivos, 25.105 linhas** de código próprio do desktop e do módulo compartilhado:

| Área | Arquivos | Linhas |
| --- | ---: | ---: |
| Frontend desktop e parser compartilhado | 68 | 17.910 |
| API e serviços Python | 33 | 5.397 |
| Desktop, scripts e núcleo Rust/SQL | 16 | 1.798 |

Além disso, foram consultados configuração Tauri, capabilities, manifests, lockfiles, pipeline de release e testes. Android foi excluído da análise de produto. Dependências instaladas, código gerado, binários, caches e documentação não são contabilizados como código próprio.

A varredura percorreu todos os arquivos desse inventário para grafo de imports, sintaxe, duplicação por blocos, funções Python equivalentes e métricas CSS. A leitura manual se concentrou em entradas, chamadas e alterações de estado, persistência, contratos, reprodução, atualização, restauração e nos candidatos detectados. **Não se trata de uma alegação de revisão humana exaustiva de cada uma das 25.105 linhas.** Arquivos longos e todos os estados possíveis exigem revisão incremental adicional. O inventário permite rastrear o escopo real.

Ferramentas: TypeScript estrito, build Vite, AST Python, Ruff nas regras F401/F811/F841/F821, PostCSS, grafo estático de imports, unittest, Node test runner, Chromium/Playwright e cargo test. A análise de clones compara corpos AST de funções Python com pelo menos seis linhas e blocos de 12 linhas com mais de 350 caracteres em arquivos diferentes; não mede toda equivalência semântica possível.

## Achados priorizados

### D01 — Alta: regressão nos carregadores dos testes de letras e backup

**Comprovado.** Referências: `tests/lyrics.test.mjs:8`, `tests/lyrics.test.mjs:12`, `tests/browser-backup-export.test.mjs:8` e `doomvault/src/services/lyrics.ts:2`.

O serviço agora importa e reexporta `parseLrc` de `../shared/lrc`. O carregador de `lyrics.test.mjs` devolve `{apiFetch: mock}` para qualquer import; assim, o parser não existe no contexto do teste. O carregador de backup pressupõe que todo módulo está em `services` e remove `./` sem distinguir caminhos que começam com `../`.

Resultado oficial: **125 testes JavaScript, 100 aprovados e 25 falhas**. Os erros incluem `parseLrc is not a function` e caminho de módulo inexistente. Como a publicação executa essa suíte e interrompe em falha, o desktop deste commit não passa pelo portão de validação.

Contraprova: em cópias temporárias fora do repositório, ajustei apenas a resolução dos imports, sem alterar o produto nem as asserções. As duas suítes, totalizando **33 testes**, passaram. Isso localiza a regressão no carregamento dos testes; não autoriza simplesmente ignorá-los.

**Ação recomendada:** atualizar os carregadores para resolver módulos compartilhados, preservar o mock de transporte apenas no import correspondente e repetir a suíte oficial completa. Não duplicar o parser de volta no desktop para contornar o teste.

### D02 — Média: URL de capa malformada causa HTTP 500

**Comprovado por reprodução.** `doomvault-api/app.py:635`, `doomvault-api/app.py:688`.

A validação inicial de `/api/cover` chama `urlparse` e acessa `parts.port` antes do bloco que captura `ValueError`. Porta textual, porta fora do intervalo e IPv6 inválido levantam exceção.

Reproduções via cliente Flask, sem consulta externa:

- `https://lh3.googleusercontent.com:invalid/a` → 500;
- `https://lh3.googleusercontent.com:99999/a` → 500;
- `https://[broken/a` → 500.

**Impacto:** uma capa inválida vira erro interno. O fallback da interface pode proteger a tela, mas o backend continua respondendo incorretamente.

**Ação recomendada:** tornar o validador total: qualquer erro de análise retorna `False`; o endpoint responde 400. Preservar allowlist, HTTPS, limites e bloqueio de redirecionamentos indevidos. Não ampliar hosts para resolver esse erro.

### D03 — Média: CSS antigo sem correspondência no frontend atual

**Evidência estática forte, candidatos precisam de confirmação individual.** `doomvault/src/styles.css:2895`, `:3082`, `:5724`, `:6491`, `:8743`.

Existem famílias de seletores como `.dv-player-top`, `.dv-v11-toolbar`, `.featured`, `.api-section` e `.bz-system-landing` que não aparecem como nomes completos no código TypeScript/TSX desktop. São indícios de layouts antigos preservados depois de redesenhos.

A listagem completa está em `grafo-e-css.json`. Ela também encontra classes montadas dinamicamente: `theme-*`, `has-update` e `ll-dupes-status-*`, por exemplo, **não devem ser consideradas mortas apenas por essa busca**. HTML externo, estado, concatenação e seletores agrupados precisam ser examinados antes de cada remoção.

**Ação recomendada:** limpar uma família confirmada por vez, comparando temas, larguras, estados vazios, erros e player mini/expandido. Não apagar blocos agrupados que também contenham seletores ativos.

### D04 — Baixa: duas regras CSS exatamente repetidas

**Comprovado por parser CSS, no mesmo contexto de regras.** `doomvault/src/styles.css:2794` e `:2815`: `.pl-hero-art img` repete largura, altura e `object-fit`. `:2784` e `:2845`: `.pl-drag-handle:active` repete `cursor: grabbing`.

**Ação recomendada:** preservar a ocorrência efetiva posterior e retirar a anterior após conferir estilos computados de capa e arraste. Remover a última indiscriminadamente pode mudar a precedência em relação a regras intermediárias. A economia é pequena; não esperar ganho perceptível de desempenho com essas duas regras isoladas.

### D05 — Baixa: imports e variável sem uso

**13 ocorrências apontadas pelo Ruff**, incluindo um script auxiliar fora do inventário principal:

| Arquivo | Linha | Ocorrência |
| --- | ---: | --- |
| `desktop/scripts/prepare_signing.py` | 32 | variável de exceção `exc` |
| `doomvault-api/api/bztune_features.py` | 9 / 17 | `json`, `abort` |
| `doomvault-api/api/library_api.py` | 19 / 22 | `unicodedata`, `os` |
| `doomvault-api/api/library_duplicates.py` | 10 | `unicodedata` |
| `doomvault-api/api/playlists_api.py` | 9 / 11 | `sqlite3`, `Path` |
| `doomvault-api/services/artist_catalog_fix.py` | 9 | `unicodedata` |
| `doomvault-api/services/artist_catalog_v12.py` | 10 | `unicodedata` |
| `doomvault-api/services/bztune_restore.py` | 10 | `argparse` |
| `doomvault-api/services/ytdlp_worker.py` | 9 | `os` |
| `scripts/check_environment.py` | 5 | `Path` |

**Ação recomendada:** remover apenas esses nomes sem uso, preservando efeitos de importação quando existirem. Não executar uma limpeza global de imports com `*`, que têm finalidade de compatibilidade. Nenhum F821 ou F811 foi relatado nessa execução selecionada.

### D06 — Média: duas implementações de rotas de artistas, mas só uma atende as requisições

**Comprovado pelo registro das views.** `doomvault-api/app.py:258`, `:306`, `:864`; `doomvault-api/services/artist_catalog_fix.py:48` e instalação ao final desse arquivo.

O app define `search_artists` e `artist_discography`; depois `install_artist_catalog_fix(app, yt)` substitui as duas entradas em `app.view_functions`. O corpo anterior de aproximadamente 150 linhas continua legível no app, embora as requisições normais usem as novas funções.

Isso confunde manutenção: corrigir a função aparentemente principal pode não mudar o comportamento real. Os corpos não são idênticos; o substituto inclui tratamento de identidade e versões que deve ser preservado.

**Ação recomendada:** promover a implementação efetiva a registro explícito de rotas, mantendo URLs e contratos. Ajustar testes que verificam substituição das views antes de retirar o instalador. Não simplesmente apagar os decorators antigos: o instalador exige que cada URL já exista uma vez.

### D07 — Baixa: elementos antigos do player ainda são montados e ocultados pelo CSS

**Comprovado no JSX e nas regras atuais.** `doomvault/src/player/MusicPlayer.tsx:834`, `:889`; `doomvault/src/styles.css:4744`, `:10464`.

A faixa de mídia contém rótulo, prévias de até cinco músicas e cartão do álbum. O mini-player oculta `.bz32-media-footer`; o layout expandido atual também oculta esse footer. Ainda existem cálculo, JSX, botões e caminhos de fallback para esse trecho. A suíte `player-artwork-fallback` chega a expor as prévias para testar esse conteúdo normalmente oculto.

**Impacto:** manutenção e DOM desnecessários no layout padrão; não foi medida uma perda perceptível de desempenho. Outras partes do player não podem ser removidas por associação: áudio oculto é funcional, e capas da fila usam lógica compartilhada.

**Ação recomendada:** decidir se as prévias continuam sendo uma opção suportada. Se não forem, retirar o trecho e apenas seus estilos/testes exclusivos, preservando mini-player, vídeo, fila, álbum e fallback ativo.

### D08 — Média: complexidade acumulada em CSS e player

**Métrica confirmada, não falha funcional por si só.** `styles.css` tem **11.259 linhas, 1.683 regras e 185 declarações `!important`**; `MusicPlayer.tsx` tem **1.134 linhas**; `api/library_api.py`, **1.214**.

Vários prefixos históricos coexistem (`dv-v11`, `dv-v13`, `dv-v131`, `bz32`). Há regras-base, temas, personalização e redesenhos posteriores no mesmo arquivo. Alterar uma regra antiga pode não ter efeito ou afetar um estado inesperado.

**Ação recomendada:** primeiro remover o que está comprovadamente obsoleto; depois organizar as seções sem mudar a ordem da cascata. Separar relógio/áudio, letras e telas do player em módulos exige preservar estado e efeitos; não fazer uma reescrita geral junto com limpeza CSS. O verificador de estrutura atual exige um CSS por entrada de plataforma: dividir em arquivos importados livremente exigiria alterar essa regra conscientemente.

### D09 — Baixa: lógica de apresentação repetida e validação de playlists duplicada

**Comprovado, com diferenças relevantes.** `App.tsx:98`, `pages/UniversalSearch.tsx:17`, `pages/ArtistPage.tsx:22`, `components/Artwork.tsx:13`, `player/PlayerArtwork.tsx:5` implementam variações de imagem/fallback. Algumas usam proxy com artista/álbum; outras recebem URL resolvida; o player usa imagem decorativa sem texto alternativo.

`playlists.list()` já valida o contrato (`services/playlists.ts:115`); `PlaylistsPage.tsx:37` valida novamente a mesma lista.

**Ação recomendada:** reutilizar `Artwork`/resolução de URL por configuração explícita e retirar a validação repetida no consumidor somente após verificar o contrato do serviço. Não unificar imagens decorativas e informativas apagando seus nomes acessíveis. Os componentes de capas não são todos semanticamente idênticos.

### D10 — Média: tratamento HTTP e observabilidade não são uniformes

**Comprovado por chamadas diretas.** Há `apiFetch`, `withRequestDeadline`, timeout manual na busca e disponibilidade local, e `fetch` direto em playlists e Home. `apiFetch` registra falhas em `diagnostic-events`; os demais caminhos não fazem esse registro automaticamente.

Assim, o histórico técnico recente do diagnóstico cobre apenas parte das requisições. Por exemplo, falhas de transporte em `services/playlists.ts:72` não passam por `recordRequestFailure`. Isso não significa que a tela fique sem erro: muitas têm tratamento local correto.

Também existem referências repetidas a `http://127.0.0.1:5000` apesar de `API` já existir em `utils/music-utils.ts:2`.

**Ação recomendada:** centralizar endereço e observação dos erros sem trocar os contratos de timeout. Preservar a reconciliação de escrita de playlists e o cancelamento específico do backend de letras. Os dois helpers de prazo não são simplesmente duplicatas: um opera sobre `fetch`; o outro também limita IPC que ignora cancelamento.

### D11 — Média no desenvolvimento: aviso de dependência no lockfile

**Relatado pelo `npm audit` nesta data.** O lockfile fixa Vite **6.4.4**, associado a `GHSA-8g5g-mxqh-grgj`, sobre bypass de `server.fs.deny` por query. O relatório npm lista duas entradas moderadas, Vite e propagação para `@vitejs/plugin-react`; não são duas vulnerabilidades independentes comprovadas.

O ambiente já tinha Vite 6.4.5 instalado. Para não usar essa diferença como evidência falsa, fiz um segundo `npm ci` em cópia isolada: o build com **6.4.4 do lockfile** também passou. O aviso está ligado ao servidor de desenvolvimento, não demonstra exposição do executável empacotado, que usa os assets compilados.

**Ação recomendada:** conferir versão corrigida e compatibilidade, atualizar deliberadamente o lockfile e repetir os builds e suítes. Não rodar `npm audit fix --force` indiscriminadamente. Não foi feita uma auditoria completa de CVEs de todos os pacotes Python/Rust nesta revisão.

### D12 — Média, risco a investigar: restauração nativa aguarda o sidecar sem prazo explícito

**Inspeção de código; travamento não reproduzido.** `desktop/src-tauri/src/main.rs:253–275` adquire a manutenção, para o backend e aguarda `command.output().await` do processo de restauração. A recuperação do serviço vem depois dessa espera. Não há um prazo explícito nesse trecho para um processo que deixe de concluir.

**Ação recomendada:** reproduzir um sidecar travado em ambiente isolado e definir recuperação segura. Não matar uma restauração por timeout sem um protocolo que identifique o estágio e garanta rollback; interromper cópia/troca de arquivos arbitrariamente pode piorar a situação. Não foi demonstrada perda de dados no código atual.

## O que parece repetido, mas não deve ser removido automaticamente

- **Playlists Python e Rust:** ambos são ativos. Tauri usa `native_playlists`; o modo navegador usa HTTP. Upload e leitura de capas ainda passam pelo serviço Python. O núcleo Rust tem oito testes aprovados e schema compatível. Retirar um lado agora elimina um caminho de funcionamento.
- **Wrappers Python na raiz:** `library_api.py`, `playlists_api.py`, `downloads_api.py`, `auto_catalog_api.py`, `catalog_queue_api.py`, `artist_catalog_v12.py` e `ytdlp_worker.py` são reexports curtos, não cópias das implementações. Devem ter seus consumidores e uso externo checados antes de exclusão.
- **Parser compartilhado:** a reutilização entre desktop/Android reduz duplicação. A falha encontrada está nos testes antigos, não é motivo para criar dois parsers.
- **Normalização Python/TypeScript:** atende camadas distintas e não é rigorosamente equivalente em todos os casos Unicode. A igualdade de intenção não autoriza substituir sem uma tabela de casos.
- **Schema e migração de playlists antigas:** `playlist_items` e o marcador `mixed_playlists_v1` preservam bibliotecas legadas; remover pelo fato de haver `playlist_entries` arrisca perder compatibilidade.
- **Assets/elementos de áudio ocultos:** `display:none` não prova que todo elemento é dispensável. O áudio pode continuar sendo o motor de reprodução.
- **Chave placeholder no Tauri do checkout:** o fluxo `prepare_signing.py` injeta configuração validada no release e `BZTUNE_RELEASE_SIGNED` controla a disponibilidade. Não classifiquei o placeholder de desenvolvimento como prova de updater de produção quebrado.

A busca de funções Python com corpo AST idêntico e de blocos longos entre arquivos não encontrou clones nos critérios definidos. Isso não contradiz os achados CSS, rotas substituídas ou lógica semelhante: são categorias diferentes.

O grafo de imports do frontend não encontrou arquivo de implementação TS/TSX órfão a partir de `main.tsx`. A exceção listada, `vite-env.d.ts`, é uma declaração de tipos, não código morto para excluir. Um módulo alcançável ainda pode conter exports ou ramos sem uso.

## Validação e preservação de funcionalidades

### Resultados executados

| Verificação | Resultado |
| --- | --- |
| Build TypeScript/Vite no ambiente existente | Aprovado |
| Instalação limpa e build com package-lock | Aprovado, Vite 6.4.4 |
| Python oficial | 242 casos, zero falhas, um ignorado |
| JavaScript oficial | 125 casos: 100 aprovados, 25 falhas — D01 |
| Duas suítes em cópias temporárias com carregador corrigido | 33 casos aprovados; não substitui o resultado oficial |
| Núcleo nativo Rust | 8 testes de integração aprovados |
| Navegador Chromium/Playwright | 31 suítes aprovadas, sem interrupção por falha |
| Verificador de estrutura | Aprovado |
| `pip check` das dependências diretas Python | Sem conflitos declarados |
| Ruff selecionado | 13 ocorrências F401/F841; sem F821/F811 |
| Sondagens reais | GitHub latest.json HTTP 200; LRCLIB, MusicBrainz e YouTube Music bloqueados pelo proxy |
| Capas com URL malformada | Três casos reproduziram HTTP 500 — D02 |

O primeiro teste Python falhou por ambiente sem `ytmusicapi` e Rust sem diretório gravável. Instalei dependências em virtualenv temporário e configurei CARGO_HOME/RUSTUP_HOME; a execução válida acima substitui aquela tentativa incompleta. Não foi necessário modificar o produto.

### Matriz de funcionalidades examinadas

Os testes de navegador usam API/YouTube simulados e dados sintéticos. Nos casos de áudio local, algumas suítes usam WAV real no Chromium. Nenhum resultado abaixo deve ser interpretado como reprodução real do YouTube ou instalação no WebView2 do Windows.

| Funcionalidade | Evidência principal |
| --- | --- |
| Início e cards recentes, menus e inclusão na fila | `home-cards`, `home-loading.test.mjs` |
| Pesquisa, formatos inválidos e recuperação | `frontend-contracts`, `frontend-action-errors` |
| Descoberta e descarte de respostas antigas | `discovery-latest` |
| Artistas homônimos e discografia | Python de catálogo, `frontend-accessible-labels` |
| Álbum, capas e créditos individuais | `album-track-artists`, `player-album-editions` |
| Favoritos e coleção sem misturar edições/Unicode | `saved-album-editions`, `album-identity.test.mjs` |
| Biblioteca grande, filtros, páginas e estado oculto | `library-pagination`, 1.500 faixas |
| Importar, duplicar, servir Range e excluir áudio | `test_user_flows_smoke_audit.py`, testes de tags/duplicatas |
| Playlists CRUD, reordenação, migração e atomicidade | Python, oito testes Rust, `native-playlists.test.mjs` |
| Prazo de escrita e reconciliação de playlists | `playlist-deadlines` |
| Fila, persistência, quota e desfazer limpeza | `queue-persistence`, `player-close-undo`, `queue-behavior.test.mjs` |
| Player expandido, rodapé e telas das opções | `expanded-player-layout`, `expanded-player-tools` |
| Atalhos, foco, navegação e restauração do estado | `player-keyboard`, `frontend-focus`, `player-data-recovery` |
| Reprodução offline/online e troca de origem | `player-source-continuity`, `online-player-recovery` |
| Volume, shuffle, loop, preferências | `player-stored-preferences`, `player-preferences.test.mjs` |
| Equalizador e crossfade | `expanded-player-tools`, `lyrics-clock`; efeitos e capacidade física dependem do áudio/WebView |
| Letras automáticas, versões, LRC e concorrência | `lyrics-auto-lookup`, `lyrics-regression`; unitários oficiais afetados por D01 |
| Relógio, seek por verso, offsets e repetição | `lyrics-clock`, com WAV local e YouTube controlado |
| Downloads, validação de áudio e retomada explícita | `download-reconciliation`, `player-download-lifecycle`, testes Python com conversor simulado |
| Histórico e estatísticas de escuta | `listening-tracker`, testes de listening e contratos |
| Personalização, temas, contraste e preferências | testes de contraste/temas, suites WCAG e layout |
| Backup/restauração de configurações e biblioteca | Python ZIP/SQLite, `browser-backup`; unitários oficiais afetados por D01 |
| Diagnóstico, exportação e rascunho de issue | `self-diagnostics`, testes de privacidade/contratos |
| Updater, verificação de assinatura e recuperação | testes Python/JS e helpers Rust extraídos; sem instalar atualização real |

### Limites de garantia

- Não foi executado o aplicativo Windows empacotado, instalador NSIS ou atualização real sobre uma instalação existente. Não há validação física de áudio, equalizador, crossfade, bloqueios reais de arquivo do Windows ou WebView2 nesta sessão.
- Fluxos ligados a provedores reais continuam dependentes de conectividade, limites e mudanças externas. Os bloqueios do proxy não demonstram defeito do BZtune, e um feed HTTP 200 não comprova instalação assinada.
- Testes de acessibilidade automatizados não substituem leitor de tela e avaliação humana de todos os estados.
- Não foi produzido percentual de cobertura de linhas/ramos. A existência de teste para uma função não significa cobertura integral.
- As funções atuais não foram alteradas durante a auditoria; isso reduz o risco de introduzir uma regressão agora, mas não elimina defeitos anteriores ou casos ainda não testados.

## Sequência de correção recomendada

1. D01: restaurar a confiabilidade da suíte oficial, sem retirar asserções.
2. D02: tratar URL de capa inválida como entrada rejeitada.
3. D04 e D05: limpar duplicações exatas/imports em mudanças pequenas.
4. D06: tornar explícita a implementação efetiva das rotas.
5. D03 e D07: retirar CSS/JSX obsoleto por família, com comparação visual e testes dos controles preservados.
6. D09 e D10: consolidar componentes e observabilidade sem alterar contratos.
7. D11: atualizar ferramenta de desenvolvimento de modo controlado.
8. D08: modularizar somente depois da limpeza; D12: reproduzir e projetar recuperação antes de introduzir timeout.

Para cada correção: registrar o comportamento anterior, alterar um item, executar testes diretamente relacionados e então a suíte geral antes de reunir tudo em um release. Dados, IDs de edições, formatos de backup e chaves de armazenamento não devem ser migrados apenas por motivo de limpeza.

## Evidências

Pasta: [docs/audits/desktop-2026-11-08](audits/desktop-2026-11-08/).

- `inventario-e-clones.json`: arquivos/linhas e limites da busca de clones;
- `grafo-e-css.json`: grafo, duplicações exatas e candidatos CSS;
- `python-codigo-sem-uso.json`: achados Ruff com localização;
- `testes-python-javascript.log`: resultado oficial, incluindo falhas;
- `teste-isolado-carregadores.log`: contraprova em cópias temporárias;
- `testes-rust.log`, `build-lockfile.log`, `npm-audit.json`;
- `reproducao-capas.log`, `sondagens-rede.log`;
- `testes-navegador.log` e `resumo-execucao.json`: resultado final de todas as 31 suítes.

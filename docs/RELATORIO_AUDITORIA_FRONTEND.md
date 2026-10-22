# Auditoria aprofundada do frontend do BZtune

Base examinada: [`d7b0ccac7d16637d71985d96238d19d2405f6ac3`](https://github.com/BadZ7br/BZtune/commit/d7b0ccac7d16637d71985d96238d19d2405f6ac3), incluindo as correções dos itens 1 a 7 da auditoria de letras. Esta rodada produz um relatório; não modifica funcionalidades nem publica instalador.

**Resultado:** dez pendências confirmadas por reprodução: três de prioridade alta, seis média e uma baixa. Build e testes existentes passaram. As falhas encontradas estão em cenários que a cobertura anterior não detectava: contratos inválidos, concorrência, operações pendentes, backup, teclado e listas grandes.

As evidências estruturadas estão em [evidencias.json](audits/frontend-d7b0cca/evidencias.json). Os dados musicais, IDs, arquivos importados e respostas de API usados nas sondagens são fictícios. Nenhuma música pessoal foi excluída, renomeada ou enviada.

## Escopo e método

Foram examinados 48 arquivos TypeScript/TSX em `doomvault/src`, com 5.689 linhas, o `index.html`, o CSS central, o script público de atualizações, os serviços HTTP/IPC e os manifests/locks npm do frontend e do desktop. O restante da marcação HTML é gerado pelos componentes React.

Ambiente: Node 24.19.0, Python 3.12.14, Chromium 154 e axe-core 4.14.0. A matriz principal foi repetida sobre o **build de produção**, servido pelo Vite preview em `127.0.0.1:4173`; a rodada inicial em desenvolvimento ajudou a obter os erros detalhados.

| Verificação | Resultado |
|---|---|
| Build TypeScript estrito + Vite | Aprovado |
| Testes JavaScript existentes | 90 aprovados |
| Testes Python existentes e de transporte | 197 executados, 2 ignorados, nenhuma falha |
| Letras: regressão, busca automática e relógio | Três suítes de navegador aprovadas |
| Recuperação de reprodução online | Suíte aprovada |
| Navegação, semântica e CSS | 12 abas examinadas em 1.360, 1.024 e 390 px de largura |
| Janela mínima desktop | Sete telas e player expandido conferidos em 960 × 640 |
| Personalização | 29 verificações de temas, cores, densidade, fontes, cantos, switches e restauração |
| Acessibilidade automatizada | Regras WCAG 2 A/AA e 2.1 A/AA com axe-core; problemas descritos em F05/F09 |
| Bibliotecas maiores | 100, 500 e 1.500 músicas, aguardando a montagem completa das linhas |
| Dependências npm | Zero vulnerabilidades conhecidas nos dois locks consultados |

Os dois testes Python ignorados exigem Rust local e bloqueio real de arquivo no Windows. A ausência desses ambientes não foi tratada como aprovação desses testes.

As sondagens de navegador interceptam as APIs: verificam o comportamento real do React com sucesso, erro, atraso, ausência de resposta e formatos inesperados, sem depender do catálogo externo. A suíte Python complementa a verificação dos contratos e do backend. Isso não equivale a testar disponibilidade e conteúdo atuais de YouTube Music, MusicBrainz e LRCLIB na internet. As tentativas adicionais de leitura pública de LRCLIB, MusicBrainz e do script `iframe_api` do YouTube terminaram em `ProxyError` neste ambiente. Esse bloqueio impede validar esses acessos ao vivo e não demonstra defeito nos provedores ou no programa.

## O que continuou funcionando

- Pesquisa com debounce, descarte de resposta antiga, timeout com mensagem e nova tentativa. Texto semelhante a HTML apareceu como texto, sem executar o evento injetado na sonda.
- Álbuns e artistas abriram com dados válidos; capas nas linhas do álbum continuaram presentes. Álbuns foram conferidos também na janela mínima e em 390 px.
- Fila, prioridade de “tocar a seguir”, shuffle, repetição e persistência cobertos pelos testes existentes.
- Player expandido, menu de letras, sincronização, clique no verso, áudio local WAV, crossfade e recuperação de falha online.
- Busca automática de letras, versões incertas, metadados tardios, cache, fonte manual, falhas de armazenamento, nova tentativa, 429, prazo compartilhado e notificação de cancelamento.
- Home com API HTTP 503 manteve a interface e ofereceu duas novas tentativas, sem cair na recuperação global.
- JSON normal exportado passou pela validação e chegou à confirmação de restauração. A confirmação foi dispensada nessa sonda para não aplicar uma restauração desnecessária.
- Quatro temas, dez cores predefinidas, três densidades, três tamanhos de texto, três estilos de cantos e cinco switches responderam às alterações e gravaram as preferências no navegador.
- CSS carregou e as telas examinadas permaneceram utilizáveis com Google Fonts bloqueado; foram usadas as fontes alternativas.

Passar nessas verificações não cobre todas as combinações possíveis de preferências, tamanhos, dispositivos e dados.

## Pendências, na ordem sugerida de correção

### F01 — Respostas inválidas da API podem derrubar o aplicativo inteiro

**Prioridade alta.** Referências: [álbum](../doomvault/src/pages/AlbumPage.tsx#L35), [biblioteca](../doomvault/src/library/LocalLibrary.tsx#L119), [playlists](../doomvault/src/playlists/PlaylistsPage.tsx#L26), [estatísticas](../doomvault/src/features/ListeningStatsPage.tsx#L25) e [ErrorBoundary](../doomvault/src/AppErrorBoundary.tsx#L4).

Respostas HTTP 200 fora do contrato reproduziram a troca da interface inteira pela tela “Não foi possível exibir esta tela”:

| Endpoint/caso | Resposta simulada | Efeito |
|---|---|---|
| Detalhes de álbum | `tracks: null` | Falha ao executar `map` |
| Biblioteca | `tracks: null` | Falha ao executar `filter` |
| Playlists | `playlists: null` | Falha ao executar `find` |
| Estatísticas | `{}` | Acesso a `totals.seconds` inexistente |

Uma biblioteca inválida provocou a mesma recuperação **enquanto o usuário estava na Home**, porque a página oculta continua montada. A proteção global evita uma página vazia, mas exige reabrir todo o aplicativo para recuperar uma falha de módulo. Não houve evidência de perda dos arquivos da biblioteca.

**A fazer:** validar as respostas antes de atualizar estado, mantendo o último dado válido; usar limites e mensagens locais. Adicionar isolamento de erro por área. Os validadores de pesquisa, Home, backup e letras já mostram um padrão que pode ser reaproveitado.

[Evidência visual da recuperação global](audits/frontend-d7b0cca/album-invalid.png).

### F02 — Operações de playlist podem permanecer bloqueadas sem prazo

**Prioridade alta.** Referências: [serviço de playlists](../doomvault/src/services/playlists.ts#L39), [ações da página](../doomvault/src/playlists/PlaylistsPage.tsx#L43) e [seletor da fila](../doomvault/src/player/QueuePicker.tsx#L29).

Ao reter a resposta de criação da playlist, o botão continuou desabilitado após **120 segundos de relógio virtual**, sem aviso ou recuperação. A mesma limitação foi reproduzida com uma promessa `native_playlists` que não conclui: o serviço aguarda diretamente o IPC. Isso comprova a falta de prazo no frontend, não um travamento observado no comando Rust real.

O helper HTTP de `PlaylistsPage` e a leitura de músicas de `QueuePicker` também usam `fetch` sem prazo próprio. A existência de `apiFetch` no projeto não protege chamadas que não o utilizam.

**A fazer:** definir prazos e estados de operação também para HTTP/IPC de playlists e seleção da fila. Em escrita com resultado incerto, consultar o estado antes de permitir repetição; não transformar timeout em uma segunda gravação automática.

### F03 — O JSON exportado pode ser recusado pela própria restauração

**Prioridade alta.** Referências: [exportação e importação](../doomvault/src/features/DataToolsPage.tsx#L39), [validador](../doomvault/src/services/browser-backup.ts#L22) e [estado pendente](../doomvault/src/services/storage.ts#L1).

Duas reproduções:

1. Um cache antigo `bztune-lyrics-v1:oldtrack` com campos vazios foi ignorado corretamente pelo player, mas exportado sem validação. Restaurar exatamente esse JSON exibiu “configurações desconhecidas ou inválidas”. A validação protege a importação; falta fazer a exportação produzir um arquivo coerente com ela.
2. Um LRC válido, mantido em memória após simular cota excedida, continuou visível no player. A exportação exibiu “Configurações exportadas”, mas o texto novo não estava no arquivo, pois o exportador lê diretamente `localStorage`. O aviso de alterações pendentes estava presente, mas não explicou a omissão no backup.

O JSON normal, sem essas condições, passou pela validação. A falha não significa que todo backup esteja quebrado.

**A fazer:** compartilhar contrato de exportação/importação; tratar caches inutilizáveis com aviso claro; incluir valores pendentes válidos ou impedir a confirmação de backup completo enquanto existirem omissões. Não descartar dados desconhecidos silenciosamente.

### F04 — A Descoberta aceita respostas antigas como se fossem da busca atual

**Prioridade média.** Referência: [DiscoveryPage](../doomvault/src/features/DiscoveryPage.tsx#L61).

Na rádio, a consulta de “Antigo” foi retida. Em seguida, “Novo” concluiu e apareceu. Quando a primeira resposta foi liberada, “Resultado Antigo” substituiu “Resultado Novo”, embora o campo ainda mostrasse “Novo”.

`run()` não cancela a requisição anterior nem confere uma identidade antes de aplicar resultado e estado de carregamento. Esse padrão difere da pesquisa universal e da busca de letras, que passaram pelos testes de resposta obsoleta.

**A fazer:** identidade por operação, cancelamento quando aplicável e aplicação do resultado somente à consulta e ao modo atuais. Conferir também atualização de recomendações e procura de perfis.

### F05 — Painéis e player deixam o foco do teclado no conteúdo de fundo

**Prioridade média.** Referências: [editor de metadados](../doomvault/src/library/LocalLibrary.tsx#L569), [escolha de playlist](../doomvault/src/playlists/AddToPlaylistButton.tsx#L51), [abertura do player](../doomvault/src/player/MusicPlayer.tsx#L831) e [lateral](../doomvault/src/App.tsx#L235).

- O editor declarou `aria-modal="true"`, mas não recebeu foco ao abrir. Pressionar Esc imediatamente não o fechou, pois o evento permaneceu fora do elemento que implementa o tratamento.
- O popover de playlist não recebeu foco inicial e permaneceu aberto após Esc.
- Após expandir o player, os primeiros Tabs chegaram à marca, às opções da lateral e aos botões da Home atrás da interface expandida.
- Em 390 px, iniciar a navegação pelo corpo da página levou o foco ao botão “Fechar menu” e aos cinco itens da lateral ainda fora da tela, com posições x negativas. Esse último caso interessa principalmente à futura interface móvel; a janela desktop atual tem largura mínima de 960 px.

**A fazer:** padronizar foco inicial, contenção quando o painel é modal, Esc e retorno ao acionador. Usar `inert`/ocultação adequada no conteúdo indisponível e no menu móvel fechado. O `<dialog>` nativo já utilizado no fluxo de restauração é uma referência possível. O menu de letras tem fechamento e retorno de foco próprios que passaram nos testes.

### F06 — A biblioteca renderiza todas as linhas, mesmo oculta

**Prioridade média.** Referências: [montagem das áreas](../doomvault/src/App.tsx#L323) e [listas da biblioteca](../doomvault/src/library/LocalLibrary.tsx#L448).

Medições no build de produção, com dados sintéticos e espera explícita pela montagem de todas as linhas:

| Músicas | Elementos totais no DOM | Heap JavaScript observado | Filtro até uma linha | Abertura até linhas prontas |
|---:|---:|---:|---:|---:|
| 100 | 5.162 | 6,20 MiB | 106 ms | 626 ms |
| 500 | 21.562 | 14,34 MiB | 133 ms | 789 ms |
| 1.500 | 62.562 | 28,01 MiB | 254 ms | 1.467 ms |

Na Home, a biblioteca oculta de 1.500 músicas também estava montada: **62.812 elementos** no documento, incluindo 1.500 linhas escondidas.

São observações locais de uma rodada, sem throttling e sem garantia de repetição no computador do usuário. Heap JS não representa toda a memória do processo. Ainda assim, a quantidade de linhas simultâneas e a montagem de áreas ocultas são verificáveis independentemente dos tempos.

A Home também iniciou consultas de gêneros, descoberta, estatísticas e diagnóstico sem visita a essas telas. A captura web de produção registrou 14 requisições iniciais de API, incluindo leituras repetidas da biblioteca; o caminho IPC do desktop altera parte dessa contagem.

**A fazer:** virtualização ou paginação real de listas grandes; inicialização das áreas sob demanda e cancelamento do trabalho oculto. Preservar estado de pesquisa e navegação sem manter milhares de linhas renderizadas.

### F07 — Algumas falhas não chegam ao usuário como erro

**Prioridade média.** Referências: [recomendações](../doomvault/src/App.tsx#L161) e [estatísticas](../doomvault/src/features/ListeningStatsPage.tsx#L39).

- Todas as consultas de recomendações retornaram 503. Não houve alerta; a interface mostrou “Nada por aqui ainda” e pediu para guardar discos, embora já houvesse favorito salvo. `Promise.allSettled` entrega rejeições como resultados, então o `catch` externo não representa falha total de rede.
- A exclusão do histórico, com conexão interrompida, gerou `Failed to fetch` sem mensagem na tela.
- A recusa de permissão da área de transferência gerou rejeição não tratada em “Copiar resumo”, também sem retorno para o usuário.

**A fazer:** distinguir ausência de conteúdo, sucesso parcial e falha total; tratar rejeições de ações assíncronas e oferecer confirmação/retentativa apropriada. Não indicar sucesso antes da confirmação.

### F08 — Favoritos e coleção escondem edições e nomes não latinos

**Prioridade média.** Referências: [normalização e deduplicação](../doomvault/src/App.tsx#L80) e [lista visível](../doomvault/src/App.tsx#L209).

Dois IDs diferentes com mesmo artista/título ficaram salvos, com contador “Favoritos 2”, mas somente um cartão apareceu. Isso também afeta a representação de edições diferentes.

Foi confirmada uma colisão adicional com nomes não latinos: dois álbuns do artista `東京`, com títulos `一` e `二`, resultaram em um cartão. A normalização remove caracteres fora de `a-z0-9`, transformando títulos e artista em chaves vazias iguais.

Os IDs não foram apagados do armazenamento; eles ficaram ocultos na apresentação. A página de artista, por sua vez, deduplica por ID.

**A fazer:** identidade por ID e normalização com suporte a Unicode. Caso haja agrupamento de edições, torná-lo explícito e permitir acessar todas, mantendo os contadores coerentes.

### F09 — Há problemas de contraste e de semântica ARIA

**Prioridade média.** Referências: [CSS](../doomvault/src/styles.css), [modos de descoberta](../doomvault/src/features/DiscoveryPage.tsx#L110) e [contêiner do vídeo](../doomvault/src/player/MusicPlayer.tsx#L850).

O axe encontrou três famílias de regras com falhas, repetidas entre telas:

- `color-contrast`: no tema escuro, textos de 8–11 px tiveram contraste entre **3,31:1 e 3,99:1**, abaixo de 4,5:1 para texto normal. Exemplos: breadcrumb, legenda superior, rodapé e descrição da categoria selecionada nas configurações. A cor de destaque não é a única responsável: há cinzas e fundos secundários envolvidos.
- `aria-required-children`: “Modos de descoberta” usa `role="tablist"`, mas os filhos continuam botões sem semântica de tab e sem seleção associada.
- `aria-prohibited-attr`: o `div` genérico do vídeo recebe `aria-label` sem papel que permita esse nome.

A checagem adicional de contraste da tela de configurações, em 390 px nos temas claro e meia-noite, não encontrou violações nessa sonda específica. Isso não aprova automaticamente todas as telas e cores desses temas.

**A fazer:** corrigir os tokens/textos que falharam, implementar o padrão de tabs completo ou usar um grupo de botões e revisar nomes/papéis dos contêineres. Revisar também estados selecionados apresentados apenas por classe CSS. Validação automatizada não substitui um teste com leitor de tela.

### F10 — Imagem quebrada na fila não aciona o placeholder

**Prioridade baixa.** Referência: [imagem na fila](../doomvault/src/player/MusicPlayer.tsx#L1025).

Uma resposta 404 para a miniatura da fila resultou em `img.complete = true`, `naturalWidth = 0` e nenhum `.bz32-queue-no-cover`. O placeholder é usado apenas quando não existe URL, não quando ela falha. O comportamento também aparece nos previews da fila.

O player principal já possui tratamento de erro de capa; falta uniformizar os caminhos restantes.

**A fazer:** reutilizar uma imagem com fallback para erro, por identidade da faixa, sem repetição infinita da URL indisponível.

[Evidência visual em 960 × 640](audits/frontend-d7b0cca/queue-image-404.png). O vídeo e as capas nessa imagem pertencem a uma sonda com provedores simulados; ela não mede a disponibilidade real do YouTube.

## CSS e HTML: avaliação técnica

O `index.html` tem doctype, UTF-8, viewport e `lang="pt-BR"`; o React fornece a estrutura das páginas. O TypeScript usa modo estrito, verificações de símbolos não utilizados e de fallthrough. Nos fluxos válidos examinados, não houve recuperação global inesperada.

O parser PostCSS aceitou a sintaxe do arquivo central. Inventário: **10.303 linhas, 1.523 regras, 5.692 declarações, 185 usos de `!important` e 19 grupos de seletores repetidos no mesmo contexto textual**. Essas contagens não provam defeitos: parte da cascata é deliberada e preserva estilos antigos. Elas mostram que mudanças devem ter verificação visual por componente e tema. Não recomendo reescrever o CSS inteiro de uma vez.

O build produziu aproximadamente **202,06 kB de CSS (31,48 kB gzip)** e **392,74 kB de JavaScript principal (115,31 kB gzip)**. Não houve aviso de chunk acima do limite do Vite. O gargalo reproduzido foi a quantidade de conteúdo montado, não uma falha de compilação do CSS.

Nas 12 telas examinadas, o documento permaneceu dentro da largura de 1.360, 1.024 e 390 px. Na janela mínima desktop, sete telas e o player expandido também permaneceram dentro de 960 px. Ausência de rolagem horizontal não comprova ausência de qualquer sobreposição. O mini-player online mantém um vídeo flutuante que deve ser revisto no desenho móvel; os testes móveis não equivalem a executar o app Android.

## APIs, segurança e dependências

Foram identificados 40 pontos de chamada a `apiFetch` e nove chamadas diretas a `fetch` nos arquivos TypeScript/TSX. Parte das diretas possui timeout manual correto, como pesquisa e disponibilidade local. A prioridade é corrigir os caminhos sem prazo e validar o conteúdo recebido, e não substituir chamadas apenas por uniformidade visual.

| Dependência instalada | Versão examinada |
|---|---|
| React / React DOM | 18.3.1 |
| Lucide React | 0.468.0 |
| TypeScript | 5.6.3 |
| Vite | 6.4.4 |
| Plugin React do Vite | 4.7.0 |
| CLI Tauri | 2.12.3 |

`npm audit --json` em `doomvault` e `desktop` retornou zero vulnerabilidades conhecidas. `npm ls --depth=0` confirmou as dependências diretas. Isso não é garantia de ausência de falhas de lógica, vulnerabilidades ainda não publicadas ou problemas nas bibliotecas nativas Rust.

A CSP Tauri foi revisada em configuração: restringe scripts a `'self'` e YouTube, bloqueia objetos e limita conexões aos destinos declarados. O teste de texto semelhante a HTML na pesquisa não executou código. Não foi demonstrada uma exploração XSS; a sonda realizada não constitui uma auditoria de segurança exaustiva.

O frontend ainda utiliza HTTP em `127.0.0.1:5000` em vários módulos; playlists já oferecem ponte IPC nativa, enquanto capas e outros fluxos ainda dependem do serviço local. Isso funciona como arquitetura desktop atual, mas precisa de uma camada de transporte por plataforma para Android. Não é necessário abandonar React/Tauri para corrigir as pendências deste relatório.

## Pendência de letras já conhecida

O **item 8 da auditoria anterior de letras**, sobre expansão de timestamps e custo de renderização, continua pendente e não foi corrigido nesta rodada. Ele pode ampliar os custos descritos em F06. O caso extremo de 160 milhões de caracteres lógicos não foi renderizado novamente para evitar uma carga desnecessária; sua reprodução e limitações estão no [relatório anterior](RELATORIO_AUDITORIA_LETRAS_RC2.md#item-8--o-limite-do-arquivo-não-limita-a-expansão-nem-o-custo-de-renderização).

A nova lista F01–F10 é específica desta auditoria do frontend e não substitui a numeração daquele relatório.

## Limites da verificação e próximos passos

Não executei o instalador no Windows/WebView2, atualização real, reprodução no Android, importação de uma biblioteca pessoal, download musical real nem restauração de arquivos reais nesta rodada. O comando nativo de playlist foi examinado pelos testes existentes e por uma ponte simulada para o cenário de espera; o IPC Rust instalado no Windows não foi exercitado diretamente. Os provedores online foram simulados nas sondagens do navegador. O build e o comportamento em Chromium foram efetivamente executados.

A ordem recomendada é F01–F03 para resiliência e proteção do backup; F04–F06 para concorrência, teclado e custo de interface; F07–F10 para mensagens, identidade, acessibilidade e acabamento. Antes de publicar outro instalador, devem ser repetidos os fluxos afetados e um teste no Windows, mantendo as correções recentes de letras e reprodução como regressões obrigatórias.

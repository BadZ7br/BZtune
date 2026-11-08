# BZtune Android — inventário e roteiro visual, etapa 1

Data: 04/11/2026. Base: versão 0.9.0, commit `36e8760`.

## Resultado

O Android já possui um conjunto útil de funções locais, mas apresenta muitas delas como formulários e grupos de botões. A repaginação deve mudar a hierarquia e a navegação antes de adicionar recursos. A principal recomendação é preservar quatro destinos — Início, Busca, Biblioteca e Ajustes — e reduzir cada item musical a capa, identificação e menu de ações.

Esta entrega é um levantamento do código e um estudo visual. Nenhuma tela do produto, API, banco, assinatura ou reprodução foi alterada. Os desenhos não são capturas de funcionalidades novas funcionando.

## Método e limites

Foram lidos os componentes Android `main.tsx`, `useNavigation.ts`, `Library.tsx`, `Albums.tsx`, `Playlists.tsx`, `ExpandedPlayer.tsx`, `OnlineExplore.tsx`, `Backup.tsx`, `Artwork.tsx`, serviços TypeScript e CSS. Também foram consultados manifesto, integração MediaSession e testes existentes de navegação/biblioteca. São fontes em `doomvault/src/mobile/` e `mobile/audio-plugin/android/`.

A interface atual foi aberta em Chromium a 380×844 com a ponte nativa simulada usada nos testes do repositório: Início, Biblioteca e Player. As capturas estão no pacote visual. Isso permite observar densidade e hierarquia; não testa áudio real, seletor Android, TalkBack, teclado do aparelho, bateria ou permissões. Nesta etapa não foi repetida toda a suíte de regressão: não houve alteração no produto.

O OpenTune indicado pelo proprietário (`https://github.com/Arturo254/OpenTune-Web`) permanece uma referência de direção, não uma dependência. Este relatório não afirma ter auditado esse repositório novamente, nem equivalência com o aplicativo do F-Droid. A proposta usa padrões de aplicativo musical — navegação curta, listas compactas, player destacado — com identidade própria; não copia código, marcas ou imagens.

## 1. Inventário completo da interface atual

| Tela ou estado | Funções encontradas | Observação para o redesenho |
|---|---|---|
| Estrutura global | Marca, identificação de teste, título da tela, avisos, navegação em quatro destinos | Manter destinos; reduzir cabeçalho repetido |
| Início | Escolher músicas para a fila, abrir biblioteca, atalhos Músicas/Favoritas/Coleção/Playlists | É predominantemente uma tela de atalhos; não há histórico/recomendação alimentando o conteúdo |
| Busca local | Reutiliza Biblioteca; busca título/artista/álbum; seleção de artista/álbum e favoritas | Hoje expõe também importação e gerenciamento completo, repetindo Biblioteca |
| Biblioteca/Músicas | Importar, buscar, filtrar artista e álbum, todas/favoritas, paginação | Até 50 linhas por página; importação até 200 arquivos |
| Ações de música | Favoritar, adicionar à playlist, tocar agora, adicionar à fila, remover registro | Cinco botões por linha. Remover preserva arquivo e fila, mas também remove referências nas playlists |
| Biblioteca/Álbuns | Busca, artista, todos/favoritos/coleção, paginação | Modelo de álbum não fornece capa; não desenhar capas reais como se já estivessem disponíveis |
| Ações de álbum | Ver músicas filtradas, ver artista filtrado, favoritar álbum, marcar coleção | Não há tela autônoma de artista/álbum local; são filtros da biblioteca |
| Coleção | Filtro dos álbuns marcados; pode conservar álbuns sem arquivos locais | Não é download nem sincronização de conta; favorita de álbum difere de favorita de faixa |
| Playlists/listagem | Criar pelo nome e escolher playlist em select | Até 100 playlists; hoje criação e detalhe ocupam a mesma página |
| Playlists/detalhe | Tocar, adicionar à fila, renomear, subir/descer, remover faixa, excluir com confirmação | Até 200 faixas por playlist; não duplicar a mesma faixa |
| Adicionar à playlist | Faixa pendente encaminha para tela de playlists; escolher/criar e confirmar ou cancelar | Deve virar seletor contextual, preservando confirmação e limites |
| Miniplayer | Capa/detalhes da atual, título, artista, tocar/pausar, abrir player ou fila | É renderizado mesmo sem faixa, com ações de abertura ainda presentes |
| Player expandido | Minimizar, mais opções/selecionar músicas, capa, título, artista, álbum, estado e erro | Dialog modal com contenção de foco; não perder esse comportamento |
| Posição e transporte | Seek, confirmação acessível de posição, ±10s, shuffle, anterior/próxima, tocar/pausar e três estados de repetição | Volume é controlado pelo aparelho |
| Fila | Contagem, selecionar faixa, subir/descer e remover, adicionar arquivos | Até 200 entradas; DTO de fila contém ID/título, não artista/capa por faixa |
| Busca online | Origem local/online; categoria Artistas/Álbuns/Músicas; consulta explícita | Não é streaming; deve manter atribuição MusicBrainz |
| Resultados e detalhes online | Artista → grupos de lançamentos → edições → faixas; gravação → lançamentos | Preservar IDs/edições/discos e aviso de lista possivelmente incompleta |
| Estados online | Carregamento, cancelar, editar/confirmar, retry, atualizar, paginação, cache/data/offline, vazio | Não esconder origem, falhas ou dado salvo |
| Ajustes | Backup e informações da versão/compatibilidade/arquivos | Ainda não é um painel amplo de preferências |
| Backup | Exportar atual, exportar cópia anterior, escolher arquivo, prévia, confirmar/cancelar restauração | Até 10 MB; não inclui áudios, capas ou permissões; restauração substitui dados e pausa o player |
| Estados globais | Sem ponte nativa no navegador, processamento, erro de operação/polling, teclado ocultando dock | Manter mensagem compreensível e contexto; sem bloquear leitura por uma operação independente |
| Navegação de retorno | Histórico da WebView, voltar entre destinos/detalhes e minimizar modal | Algumas seleções locais são estado interno; detalhe com rota própria é trabalho novo |

### Funções fora da página, que devem continuar funcionando

O projeto possui serviço de reprodução Media3/MediaSession, serviço de mídia em primeiro plano e integração nativa. A repaginação não deve recriar esse motor em JavaScript. Notificação, reprodução fora da tela, restauração da sessão e continuidade do áudio precisam entrar no aceite no aparelho, mesmo sem serem telas React.

### O que NÃO está implementado no Android

Não foram encontrados componentes/comandos Android equivalentes a letras/LRCLIB, equalizador, crossfade, streaming/download online, diagnóstico com envio de issue, conta/sincronização ou atualização dentro do app. Recursos do desktop não devem aparecer como opções Android funcionais. São projetos separados, não correções puramente visuais.

## 2. Exclusões recomendadas

“Excluir” significa retirar da superfície principal ou reorganizar; nenhuma exclusão de arquivos, dados ou função está autorizada por este relatório.

| ID | Retirar de onde está | Destino ou substituição |
|---|---|---|
| E01 | Cinco botões permanentemente visíveis em cada música | Toque na linha para tocar; `⋯` abre ações completas com rótulos |
| E02 | Quatro botões permanentemente visíveis em cada álbum | Entrada para músicas/detalhe; favoritas e coleção em ações contextuais |
| E03 | Formulário de criar + select + renomear + excluir sempre na página de playlists | Lista visual; criar por `+`; detalhe e edição em contextos próprios |
| E04 | Texto explicativo longo repetido antes dos resultados | Ajuda contextual ou estado vazio; avisos de perda de dados continuam no momento da ação |
| E05 | Selo “Android · teste” em todo cabeçalho | Sobre a versão, mantendo indicação de distribuição de teste ali |
| E06 | Miniplayer sem faixa como barra fixa de conteúdo vazio | Ocultar até haver sessão/fila; Início mantém importação e estado vazio |
| E07 | Duplicação de gerenciamento na Busca local | Busca retorna faixas e filtros; importação/gestão ficam na Biblioteca, acessíveis por ações |
| E08 | Subir/descer/remover expostos em cada linha da fila | Menu por entrada e modo de organizar; manter alternativas acessíveis, sem exigir arrastar |

Não excluir: ±10s, shuffle, repetição, exportação da cópia anterior, filtros, paginação, cancelamento online, edição distinta, confirmação de restauração ou recuperação de erro. Limites existentes devem permanecer claros quando relevantes.

## 3. Melhorias obrigatórias para aprovar a repaginação

São requisitos de qualidade do redesenho, não uma afirmação de que todos constituem bugs reproduzidos.

| ID | Requisito e evidência | Critério de aceite |
|---|---|---|
| O01 | Reduzir densidade: os grupos de botões estão explícitos em Library/Albums/Playlists | Mais músicas visíveis; todas as ações antigas mapeadas e acessíveis no máximo por abrir menu + escolher |
| O02 | Separar consultar, tocar e gerenciar: online não é áudio | Nenhum play/download em resultado MusicBrainz sem implementação real; rótulo local/online e fonte visíveis |
| O03 | Novos menus devem ser acessíveis; dialog atual já contém foco | 48 CSS px como referência mínima de alvo, nomes acessíveis, TalkBack, foco/restauração, Voltar/Escape e fechamento coerentes |
| O04 | Compatibilidade depende da WebView: há dialog.showModal, :has, aspect-ratio e ResizeObserver no frontend | Definir WebView mínima testada no Android 7, validar APIs/fallbacks; minSdk 24 sozinho não comprova suporte visual. Não presumir funcionamento na WebView original de 2016 |
| O05 | Player e controles devem caber com teclado, orientação e fonte grande | Testar 320×568, 360×640, 412×892 e paisagem; sem rolagem horizontal, sem rodapé cobrindo ações, fonte 200% com rolagem apropriada |
| O06 | Preservar semântica de dados | Remover registro ≠ apagar arquivo; favorita de faixa ≠ álbum; coleção ≠ download; confirmação explica alterações em playlists |
| O07 | Separar estados de rede de estados locais | Offline/cache/data, vazio, carregamento, cancelado e erro recuperável; nunca sugerir “sem resultados” para erro de rede |
| O08 | Conservar validação e concorrência | Busca só no envio, respostas antigas descartadas, operação pendente não duplica ação, não mudar fila ao consultar catálogo |
| O09 | Não inventar metadados no desenho final | Fila atual só tem título; artista/capa por entrada e capa do álbum exigem ampliar contratos ou usar fallback honesto |
| O10 | Preservar fluxos de backup | Exportação atual/anterior acessíveis; prévia antes de restaurar; cancelamento sem alteração; permissões/áudios não prometidos no backup |
| O11 | Uniformizar estados e tokens visuais | Cores/espaços/raios/tipografia e componentes comuns; contraste medido ≥4,5:1 texto normal, ≥3:1 texto grande/controles relevantes, foco visível; não usar só cor para estados |
| O12 | Rastrear cada controle até o comando atual | Matriz abaixo usada na regressão; alterações visuais não podem exigir recriar motor de áudio, banco ou identidade de assinatura |

O bloqueio global de navegação em `main.tsx` usa busy/dataWorking. Recomenda-se revisar a abrangência em implementação: bloquear mutações incompatíveis pode ser necessário; bloquear leitura/troca de tela por operação independente deve ter justificativa. Não remover travas sem estudar concorrência e restauração.

## 4. Melhorias sugestivas, por ordem de valor

1. **Detalhe dedicado de álbum local e playlist:** melhor contexto e retorno. Exige rotas novas; álbum hoje encaminha a filtro.
2. **Início útil a partir dos dados existentes:** continuar fila salva e atalhos. “Recentes” reais exigem registrar/consultar histórico; não usar dados fictícios em produção.
3. **Seletor de playlist em painel inferior:** criar/adicionar sem abandonar a música de origem. Reutilizar contratos e validação.
4. **Capas dos álbuns e detalhes da fila:** ampliar DTOs com cache/limites; não carregar arte de todas as faixas a cada segundo.
5. **Modo de edição e arrastar para ordenar:** melhoria opcional; manter botões acessíveis de movimentação.
6. **Ordenação por título/artista/adição:** requer suporte e ordenação no catálogo antes da paginação, não apenas nas 50 linhas visíveis.
7. **Temas claro/escuro/sistema:** somente depois de tokens e testes de contraste. A proposta atual mostra um único tema escuro.
8. **Ações em lote:** fase posterior; seleção, confirmação e limites devem ser desenhados antes.
9. **Capas online:** futura integração com outro serviço/fonte, política de cache e atribuição; MusicBrainz atual não fornece arte pelo contrato do app.
10. **Letras e áudio online:** trilhas funcionais separadas, após estabilizar navegação/player; não incluir botões inativos apenas para enfeitar.

## 5. Direção visual e telas entregues

Proposta: azul quase preto, superfícies discretas, âmbar para ação/estado ativo, tipografia de sistema, margens de 20 px e capas quadradas. Evitar borda em todo botão/card: bordas delimitam grupos, seleção e mensagens. Ícones acompanham rótulos onde a intenção não for óbvia.

Quatro destinos mantidos. Miniplayer acima da navegação quando houver sessão; player expandido independente da navegação principal. No player, capa, identificação, posição e transporte recebem prioridade; rodapé de funções mantém Player, Fila e Adicionar, sem recursos fictícios do desktop. Repetição continua com três estados. ±10s permanece acessível.

| PNG | Tela | Mudança sugerida |
|---|---|---|
| tela-01 | Início | Continuar sessão e atalhos, conteúdo derivado da biblioteca |
| tela-02 | Biblioteca/músicas | Lista compacta, favoritas, filtros e importação contextual |
| tela-03 | Busca online | Origem e categorias claras; consulta explícita e ausência de streaming |
| tela-04 | Artista online | Cabeçalho próprio e lista de lançamentos |
| tela-05 | Álbum local | Novo contexto de álbum; favoritas e coleção independentes |
| tela-06 | Playlist | Detalhe dedicado com tocar/enfileirar e edição contextual |
| tela-07 | Player | Capa, identificação e transporte em primeiro plano |
| tela-08 | Fila | Atual destacada; opções de movimentação/remoção abertas |
| tela-09 | Ajustes | Entradas organizadas para dados e informações |
| tela-10 | Backup | Prévia legível e consequência da restauração explícita |
| tela-11 | Ações da música | Todos os cinco comandos atuais num painel |
| tela-12 | Falhas/cache | Exemplo de cópia salva e alternativa sem cache |

As 12 telas são estudos HTML renderizados em PNG, com controles demonstrativos sem backend. As capas são desenhos geométricos fictícios; números e metadados são ilustrativos. Na tela 12, dois estados alternativos estão juntos apenas para revisão. Textos técnicos de revisão no rodapé de alguns desenhos não entram no produto final.

Na proposta da fila, artistas por entrada são ilustrativos e dependem do O09. A tela de álbum apresenta uma nova composição; não significa que já exista endpoint de detalhe ou reprodução de álbum. A tela de artista online mantém o caminho grupo → edição → faixas: o seletor de edição precisa ser desenhado na próxima rodada, mesmo sem PNG próprio nesta entrega. Não foi produzida uma imagem de cada estado combinatório.

## 6. Matriz de preservação de funcionalidades

| Grupo atual | Destino no novo desenho | Observação |
|---|---|---|
| Importar catálogo | Biblioteca/+ e Ajustes/importar | Mesmo seletor, limite e acesso persistente |
| Escolher arquivos para fila | Player/mais opções | Não confundir com importar catálogo |
| Adicionar arquivos à fila | Rodapé Adicionar | Preservar append e limite |
| Buscar e filtrar local | Busca local e Biblioteca/filtros | Preservar artista/álbum/favoritas/página |
| Tocar/favoritar/enfileirar/adicionar playlist/remover registro | Linha + painel de ações | Mesmos comandos, avisos e efeitos |
| Marcar favorita/coleção de álbum | Contexto do álbum | Estados independentes; edição identificada |
| Criar/selecionar playlist | Lista de playlists e criar/+ | Lista substitui select sem perder identidade |
| Renomear/excluir playlist | Menu do detalhe | Confirmação destrutiva preservada |
| Reordenar/remover da playlist | Modo editar/menu por faixa | Botões continuam como alternativa |
| Tocar/enfileirar playlist | Ações do detalhe | Preservar revisão da playlist |
| Tocar/pausar/anterior/próxima/shuffle/repeat/seek/±10s | Player | Manter estados e limite de duração |
| Abrir/minimizar player e abrir fila | Miniplayer/rodapé/Voltar | Foco e áudio preservados |
| Selecionar/reordenar/remover da fila | Linha/menu da fila | IDs das entradas, não só título |
| Categorias e rotas MusicBrainz | Busca online, artista, grupos, edições, faixas | Não colapsar edições pelo título |
| Atualizar/cancelar/retry/paginar online | Contexto/resultados | Cache com data e informação da fonte |
| Exportar backup atual/anterior | Ajustes/Backup | Cópia anterior continua disponível |
| Prévia/confirmar/cancelar restauração | Backup/confirmação | Sem restaurar no ato de selecionar arquivo |
| Erros/loading/vazio/sem ponte | Estados dos componentes | Avisos específicos, sem sumir com dados válidos |
| Serviço/notificação/foco de áudio | Integração nativa existente | Regressão obrigatória no aparelho |

## 7. Ordem de execução e critérios de saída

1. Tokens e componentes: botões, menus, linhas, chips, mensagens, navegação e safe areas.
2. Biblioteca e Busca local: maior redução de poluição; preservar filtros e paginação.
3. Álbuns/Coleção e Playlists: contexto de detalhe, criar, selecionar, editar e confirmar.
4. Player e Fila: rodapé estável, estados de transporte e opções contextuais.
5. Busca online: resultados, artista, edição e faixas com origem/cache claros.
6. Ajustes/Backup: gerenciamento e estados destrutivos legíveis.
7. Início orientado a dados reais, sem inventar histórico.
8. Regressão visual/funcional, WebView mínima, aparelho e APK assinado de teste.

Cada etapa exige: comparar fluxo antigo/novo, validar ida/volta, erros e cancelamento; executar testes pertinentes; atualizar seletores por semântica quando o desenho mudar. Não resolver teste de botão desaparecido simplesmente apagando a cobertura do comando. Validar 320/360/412 px, paisagem, fonte ampliada, nomes longos/Unicode, capa ausente/quebrada, fila vazia/cheia, permissão revogada e rede ausente.

A56: importação e acesso após reabrir, música local durante busca, tela apagada, notificação e interrupções de áudio. Android 7: repetir em emulador com WebView documentada e, quando disponível, aparelho real. Emulador não substitui bateria/Bluetooth/rotinas do fabricante.

## Arquivos

Em `artifacts/android-design-2026-11-04/`: `proposta-visual.html`, três pranchas PNG, 12 telas PNG individuais, três capturas atuais com ponte simulada e pacote ZIP. O HTML é autônomo e pode ser aberto no navegador; seus botões representam o layout, não operações do BZtune.

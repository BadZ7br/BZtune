# Redesenho Android — progresso

Referência aprovada: imagem de oito ideias gerada em 04/11/2026, baseada no estudo visual e no inventário de frontend. A imagem é direção de produto, não demonstração de funções disponíveis.

## Etapa 1: base visual e Biblioteca

Implementada nesta alteração:

- Paleta azul escuro/âmbar, navegação, chips, miniplayer e estilo do player alinhados à referência. CSS importado somente pelo ponto de entrada Android.
- Busca compacta na Biblioteca e filtros artista/álbum em painel inferior. Os filtros continuam sendo consultas ao catálogo inteiro, com paginação preservada.
- Importação por botão `+` com nome acessível; informações sobre arquivos recolhidas em ajuda.
- Linhas com capa/fallback, título, artista/álbum e indicação de favorita. Tocar na linha usa o comando existente de reprodução.
- Menu `⋯` abre painel com os cinco comandos existentes: tocar, enfileirar, playlist, favorita e remover registro. A remoção continua preservando áudio/fila e retirando referências das playlists.
- Painel modal com histórico para fechar por Voltar, Escape/fechar, contenção e retorno do foco; callbacks para navegar à playlist só executam depois do fechamento.
- Testes anteriores atualizados para percorrer os novos menus, sem remover verificações de persistência, erros ou isolamento da fila.

Validação: build Android TypeScript/Vite e oito suítes Playwright aprovados: player, library, playlists, albums, navigation, online, backup e design. A suíte nova verifica faixa visível na primeira tela 380×844, ações contextuais, Back/Escape, foco, histórico sem entrada duplicada em StrictMode, um comando por confirmação, enfileiramento e filtros em 320×568 e 640×360. Ponte nativa simulada; não comprova áudio/TalkBack/WebView em aparelho.

Capturas do frontend implementado, com dados de teste e capas ausentes, em `artifacts/android-frontend-stage1/`. Não são as imagens conceituais geradas.

## Etapa 2: Artistas e detalhes dos álbuns locais

Implementada em 04/11/2026:

- Nova aba Artistas com lista completa de nomes do catálogo (não apenas dos primeiros 50 arquivos), busca tolerante a acentos, paginação de 50 nomes e consulta suspensa quando a aba fica oculta.
- Busca e página de artistas gravadas no estado de navegação; retorno após abrir detalhes ou recarregar conserva o contexto. Históricos antigos, sem os novos campos, continuam aceitos.
- Página de artista com identificação local, álbuns em grade e músicas. São respeitados os créditos de faixa/artista do álbum usados pelo catálogo; não há biografia ou imagem obtida da internet. Os filtros adicionais de álbuns ficam recolhidos.
- Álbuns em grade de duas colunas; menu contextual para músicas, artista, favorita e coleção. Cada edição mantém seu ID/ano, mesmo com títulos iguais.
- Página de álbum com metadados, favorita/coleção e faixas. Busca, favoritas, tocar, enfileirar, playlist e remoção de faixas reutilizam a Biblioteca; o ID do álbum/artista permanece fixo e não pode ser limpo pelos filtros internos.
- Capas de detalhe usam dados reais dos arquivos, quando disponíveis na consulta. Grade/identificação de artista usam placeholders; não há download de arte nem capas inventadas em produção.
- O comando nativo existente de álbuns ganhou leitura `detail`, filtrada pelo ID exato e com prazo de resposta no frontend. Isso recarrega estados atuais ao abrir a página, inclusive depois de reload, sem depender das primeiras 50 edições. Nenhum comando/ACL novo, migração do banco ou mudança do formato de backup.
- Dados incompatíveis, falhas e registro ausente não habilitam marcação sobre o álbum errado. Álbum salvo sem arquivos continua na coleção e pode abrir seu estado vazio.

Validação: nove suítes Playwright aprovadas (as oito anteriores + artists), builds Android/desktop e verificação de estrutura. No Kotlin/Robolectric API 24: 66 testes aprovados, uma sondagem de API real ignorada por padrão, zero falhas/erros. Os novos testes nativos verificam lookup além da primeira página, estado atualizado, edições distintas e coleção sem arquivos.

A suíte artists cobre Unicode/busca de 53 artistas, paginação, artista → edição → retorno/reload, flags independentes por edição, filtros fixos, tocar/enfileirar a faixa correta, rejeição de detalhe incompatível, retry de erros, álbum sem arquivos, tela estreita e histórico de detalhe inválido. Os testes de navegador usam ponte simulada e não atestam áudio físico. A pesquisa de MusicBrainz e o serviço de reprodução mantêm seus fluxos existentes.

Capturas da implementação com dados de teste: `artifacts/android-frontend-stage2/artistas.png`, `artista.png`, `albuns.png` e `album.png`. Os arquivos de teste não contêm capas; os placeholders mostrados são intencionais. Nenhum APK foi publicado nesta etapa; a integração exige compilar o frontend e o plugin nativo juntos.

## Etapa 3: Playlists e seletor contextual

Implementada em 04/11/2026:

- Lista de playlists com busca por nome e botão de criação. Removido o select que misturava escolha, criação e gerenciamento na mesma página.
- Página de detalhe identificada pelo ID da playlist no histórico: nome, quantidade, tocar e enfileirar, além de faixas compactas. Retorno e reload mantêm o destino; IDs ausentes mostram erro recuperável.
- Menu da playlist para renomear e excluir; exclusão exige confirmação explícita e preserva arquivos, biblioteca e fila. Menu por faixa mantém subir, descer e remover, com os limites de posição.
- “Adicionar à playlist”, na música de origem, abre um painel de destino em vez de navegar para outra aba. Busca/criação de destino, escolha e confirmação acontecem ali, mantendo a tela e o texto de busca de origem.
- Criar uma playlist no painel não adiciona a faixa automaticamente: a confirmação continua explícita. Faixas já presentes e destinos com 200 músicas impedem nova adição; criação respeita 100 playlists.
- Mutações usam as revisões nativas existentes. Respostas inválidas, conflitos e ausência de confirmação mantêm o erro e exigem consulta antes de tentar a adição novamente. O painel bloqueia fechamento/Back durante uma mutação enviada, sem abandoná-la por timeout de frontend.
- Mensagem de sucesso no contexto original, com opção de dispensar. Sem reprodução, downloads, alterações de fila ou duplicação de arquivos durante organização.
- ActionSheet passou a tratar Escape explicitamente (inclusive dentro de busca preenchida), manter foco ao trocar de formulário e proteger uma operação em andamento.

Validação: dez suítes Playwright aprovadas: player, library, backup, playlists, playlist-picker, albums, artists, navigation, online e design. Builds Android/desktop e verificação de estrutura aprovados. O teste de fonte ampliada foi sincronizado para aguardar o novo tamanho do dock antes de rolar ao último parágrafo; o critério de não sobreposição foi preservado.

A suíte nova cobre origem/busca, criar e confirmar separadamente, cancelamento por Back/Escape, duplicatas, limites 100/200, seleção filtrada, bloqueio durante comando pendente, conflitos e resposta inválida após uma alteração que já ocorreu (reconsulta detecta a duplicata), sem comandos de reprodução e em 320×568. A suíte anterior continua cobrindo renomeação/ordem/persistência/reload, reprodução/enfileiramento, arquivo indisponível e exclusão segura pelos novos menus.

Capturas reais do frontend com ponte simulada em `artifacts/android-frontend-stage3/`: `playlists.png`, `playlist-detalhe.png`, `seletor-playlist.png`. O conteúdo é de teste; não comprova áudio físico. Nenhum contrato nativo, banco, formato de backup ou assinatura foi modificado nesta etapa. Nenhum novo APK foi publicado.

## Etapa 4: Início com conteúdo real

Implementada em 04/11/2026:

- “Continue ouvindo” usa a faixa e a posição atuais da fila, sem criar histórico artificial. Retomar chama play; não reconstrói a fila nem envia seek. Se estiver tocando, a ação abre o player.
- “Adicionadas recentemente” e “Suas favoritas” usam uma consulta nativa transacional e limitada a seis cards por seção, com contagens do catálogo inteiro. As amostras não são inferidas das primeiras 50 faixas em ordem alfabética. Favoritas são apresentadas por título, sem alegar recomendação personalizada.
- Cards priorizam capa real/fallback, título e artista; tocar, enfileirar, playlist, favorita e remoção usam os comandos existentes. Organizar não modifica a fila. Há estados de vazio, carregamento, falha recuperável e preservação da última resposta válida.
- Os atalhos e a importação ficam depois do conteúdo musical. “Importar músicas” salva no catálogo; “Escolher músicas” preserva o fluxo de arquivos para a fila. A importação do catálogo não começa a tocar automaticamente.
- Miniplayer vazio oculto; navegação continua disponível. A altura do dock continua acompanhada por ResizeObserver. Mensagens de adição à playlist aparecem acima do dock, podem ser dispensadas e expiram após seis segundos.
- O Início conserva dados enquanto oculto, mas não renderiza cards nem faz consultas em segundo plano. A consulta é atualizada ao retornar ou mudar o catálogo, nunca a cada segundo de posição do player. Respostas antigas são descartadas.

### Persistência e compatibilidade

SQLite passou de versão 5 para 6. A nova tabela `track_additions` guarda IDs com ordem monotônica de primeira inclusão, em transação com a importação. Reimportar atualiza metadados e preserva favorita/ordem. Remover um registro elimina sua referência por chave estrangeira. Arquivos anteriores à migração não recebem ordem inventada; reimportar um registro já existente também não o transforma em uma adição nova.

Backup passou de formato 4 para 5, com `added` contendo os IDs conhecidos em ordem de inclusão. A restauração valida referências/duplicatas antes de alterar os dados e restaura catálogo, ordem e journal na mesma transação. Backups de formatos 1–4 continuam aceitos, com histórico de adição vazio. O arquivo de backup não inclui áudios, capas nem permissões, como antes. A cópia anterior também continua exportável. Foi atualizada a orientação da tela de backup.

A consulta usa `library_list` com parâmetro opcional `home`, encaminhado explicitamente pela ponte Rust e interpretado pelo plugin Kotlin. Chamadas antigas continuam com o comportamento de listagem. Não foi adicionado comando ou ampliada a ACL.

### Validação

- Onze suítes Playwright aprovadas: player, library, backup, playlists, playlist-picker, albums, artists, navigation, online, design e home. Fixtures das outras telas receberam uma resposta vazia válida para o novo resumo; a suíte específica exercita os dados do Início.
- A suíte home verifica limite/ordem das amostras, retomar sem seek/autoplay, tocar a faixa correta, playlist/favorita/remoção, importação/reimportação/cancelamento, ausência de recarga pelo polling, erros, resposta antiga, catálogo vazio/legado, 320 px e ausência de conexão externa.
- Kotlin/Robolectric API 24: 72 aprovados, uma sondagem real ignorada por padrão, zero falhas/erros. Novos casos cobrem contagens além de 50 faixas, limites de seis cards, ordem persistente, reimportação, exclusão, migração 5→6 preservando favoritas/playlists/coleção, backup 5 e legado 4, referências inválidas e rollback de importação/restauração.
- Builds Android/desktop, verificação de estrutura e compilação local completa do APK ARM 32/64 aprovados. A compilação Android valida também o parâmetro na ponte Rust e a integração do plugin Kotlin. A assinatura é debug local; isso não constitui publicação nem prova de atualização sobre o certificado fixo.

Capturas do frontend com ponte simulada: `artifacts/android-frontend-stage4/inicio.png` e `inicio-vazio.png`. Os dados de teste não incluem imagens de capa; os placeholders são intencionais. Áudio físico, WebView, migração de instalação existente e seletor de arquivos ainda exigem validação no A56/Android 7.

## Etapa 5: Player, favorita e fila em painel

Implementada em 04/11/2026:

- Coração junto ao título para marcar/desmarcar a faixa atual. O retorno de `track_details` inclui `libraryId` e `favorite`, identificados pela URI importada, independentemente do ID da entrada da fila ou do título. Arquivo avulso sem registro não habilita favorita e apresenta orientação para importar.
- O frontend aceita detalhes antigos sem esses dois campos como “sem vínculo”; pares parcialmente inválidos são rejeitados. Escrita usa `library_favorite`, já existente; não há comando/ACL ou tabela nova.
- Confirmação de favorita só atualiza os detalhes da mesma entrada/arquivo e sessão de restauração. Respostas de uma faixa anterior não marcam visualmente a seguinte. Ações duplicadas ficam bloqueadas durante a gravação; falhas preservam o estado não confirmado. Transporte continua disponível para trocar de faixa.
- Biblioteca e detalhes locais passam a consultar novamente o catálogo quando a favorita do player muda. Metadados válidos da mesma faixa permanecem visíveis durante atualização, evitando piscar capa/artista; troca de ID ou restauração limpa o contexto anterior.
- Fundo do player usa cor dominante da capa JPEG privada, decodificada em canvas 32×32 somente com o player aberto. O cache tem no máximo oito capas; não são buscadas URLs externas. A tonalidade fica escura (componentes até 80), sem mudar a cor dos controles/textos. Ausência, erro de decodificação ou troca de capa utiliza fundo neutro; resultados antigos não transferem a cor para outra música.
- Rodapé Player/Fila/Adicionar à fila e transporte preservados, incluindo shuffle, três estados de repetição, anterior/próxima, tocar/pausar, posição e ±10s. A barra de posição ganhou aparência consistente, mantendo controle por teclado e confirmação acessível.
- Fila abre em painel inferior sobre a capa, acima do mesmo rodapé. A altura acompanha o rodapé por ResizeObserver; a lista tem rolagem própria e atual destacada. Só a música atual mostra artista/capa, pois esses metadados não são fornecidos por entrada na fila.
- Cada entrada tem menu `⋯` com subir/descer/remover; a operação usa ID e posição, sem procurar só pelo título. Títulos repetidos recebem posição nos nomes acessíveis. Fila vazia mantém acesso a adicionar arquivos.
- Voltar/Escape/Fechar fila retornam ao player; minimizar encerra o player inteiro. Abrir fila pelo miniplayer permite voltar primeiro ao player e depois à tela de origem. Entradas antigas de histórico usam fechamento compatível. Menus temporários são descartados ao recarregar e sua entrada do histórico é consumida, evitando um retorno extra sem mudança visual.
- Menus dentro da fila têm contenção de foco própria; o painel retorna foco ao botão Fila e não envia comandos de reprodução ao abrir/fechar.

Validação: doze suítes Playwright aprovadas (as onze anteriores + player-design), builds Android/desktop e verificação de estrutura. Kotlin/Robolectric API 24: 74 aprovados, uma sondagem live ignorada, zero falhas/erros. Os casos nativos adicionais distinguem arquivos com título igual, vínculo por URI, mudança de favorita e arquivo removido sem alterar metadados da sessão.

A suíte player-design verifica favorita pendente seguida de troca para outra faixa com mesmo título, falha sem confirmação falsa, arquivo avulso e resposta de vínculo inválida, cores de capas locais/fallback, preservação do rodapé, menus aninhados com Tab/Back/Escape, reload com menu aberto, histórico legado, reordenação/remoção por ID, fila vazia e painel em 320×568. A ponte nativa é simulada no navegador; os desenhos de capa dessa suíte são imagens locais de teste.

Capturas: `artifacts/android-frontend-stage5/player.png` e `fila.png`. Compilação local completa ARM 32/64 validada para conferir integração do plugin; não é uma publicação com o certificado fixo. Ainda é necessário testar áudio, foco/TalkBack e WebView no A56/Android 7. Banco/backup permanecem nas versões 6/5 da etapa 4.

## Etapas 6–9: sugestões restantes (07/11/2026)

### Ordenação e capas

A Biblioteca oferece Título, Artista, Álbum e Adicionadas recentemente no painel de filtros. A ordenação é uma enumeração validada no SQLite antes de limitar/paginar resultados; registros antigos sem ordem conhecida ficam depois das adições conhecidas. Mudar a ordem retorna à primeira página. A grade de álbuns usa a capa privada disponível em uma das faixas da edição, sem buscar imagens na rede. Álbum sem arquivo/capa mantém placeholder. IDs e anos continuam distinguindo edições.

### Operações em lote

Seleção explícita por checkbox na Biblioteca, com limite de 200, pode atravessar páginas e ser cancelada. A seleção é enviada à fila por uma única chamada; o plugin resolve todos os IDs e verifica o acesso aos arquivos antes de alterar o player, conferindo o limite da fila no momento da aplicação. Para playlists, o seletor existente aceita vários IDs. A ação nativa `add_many` confere revisão, existência e limite dentro da transação, elimina referências já presentes e falha sem adição parcial. Não há exclusão em lote nem criação de arquivos duplicados. A seleção em lote está na Biblioteca principal, não nas páginas de detalhe.

### Temporizador

Mais opções do player → Temporizador: 15/30/60 minutos, ao terminar a música e desligar. A execução está no MediaSessionService, com relógio monotônico e callbacks nativos; não depende de timer JavaScript nem da tela aberta. Final/repetição da faixa dispara pausa uma vez; troca manual cancela o modo de terminar a faixa. Restauração e destruição do serviço cancelam o temporizador. Ele não é um alarme persistente através de encerramento do processo, nem implementa fade. A tela consulta o estado ao abrir/configurar, sem contagem regressiva animada.

### Letras Android

Mais opções → Letras consulta LRCLIB ao abrir e ao mudar de faixa. O plugin lê metadados da sessão/registro importado e faz GET HTTPS de host fixo, com redirecionamentos desabilitados, User-Agent, timeout e limite de resposta. Executor separado e fila limitada evitam bloquear o catálogo local. A WebView não ganhou acesso de rede direto. A consulta desta versão é exata por título/artista/duração; não há busca aproximada nem seletor de versões.

Há texto simples, instrumental, realce de linha sincronizada, seek por linha, tocar/pausar e acompanhamento que pode ser desligado para rolar manualmente. Importação de arquivo LRC UTF-8 de até 512 KB é temporária nesta tela; fechar a tela não o salva. Não há cache persistente das letras ou ajuste manual de sincronização nesta primeira implementação. O parser LRC foi extraído sem alteração do desktop para módulo compartilhado e usado pelo Android, incluindo múltiplos timestamps, offset e preservação de colchetes no texto. A exibição é limitada a 2.000 linhas sincronizadas.

Resposta antiga, ID de faixa incompatível, erro da API e arquivo inválido não substituem a letra de outra faixa. O resultado é texto React, sem HTML remoto. Abrir a tela informa que título, artista e duração são enviados ao LRCLIB.

### Verificação final do conjunto

81 testes Kotlin aprovados, uma sondagem live ignorada e zero falhas/erros. Novos casos verificam ordenação de 61 registros antes da paginação, reimportação estável, capa/álbum vazio, lote atômico com revisão/deduplicação, expiração/cancelamento/repetição do temporizador e validação de resposta de letras.

Treze suítes Playwright aprovadas. A suíte `android-remaining` percorre os novos fluxos com ponte simulada, incluindo offset LRC compartilhado, importação e falha do provedor. Um teste de playlists recebeu erro HTTP enquanto uma compilação reconstruía os assets da prévia; a repetição após a compilação passou, sem mudar a lógica do produto. Builds Android/desktop, estrutura e APK debug local ARM 32/64 aprovados. A compilação também validou os novos comandos/ACL de temporizador/letras e os argumentos de lote/ordenação na ponte Rust.

A tentativa real de LRCLIB neste ambiente foi bloqueada pelo proxy (HTTP 403 no túnel). Não afirmar sucesso da API real. Continuam necessários testes no A56/Android 7 de TLS, arquivos, temporizador em segundo plano, áudio e TalkBack. O conjunto não foi publicado como atualização assinada; a compilação local é debug. Banco 6 e backup 5 continuam os da etapa 4.


## Publicação Android 0.10.0 — 07/11/2026

Publicado o conjunto das etapas 1–9 com certificado estável na
[release android-v0.10.0](https://github.com/BadZ7br/BZtune/releases/tag/android-v0.10.0).
[CI 42439173271](https://github.com/BadZ7br/BZtune/actions/runs/42439173271)
concluído com sucesso para o commit `893bf46`: treze suítes de interface,
testes nativos, sondagem real MusicBrainz, ferramentas de assinatura e
verificação do certificado fixo e do Android mínimo.

APK público baixado e conferido: `BZtune-Android-0.10.0.apk`, 32.746.105 bytes,
versionCode 10000, minSdk 24, targetSdk 37, ARM 32/64. SHA-256 verificado
contra o arquivo público `SHA256SUMS.txt`:
`2d033b9a4f0798383674b797ffddc3a0648fe2a1ca424cee7e9f7fd827db4012`.

A primeira tentativa falhou na interface; o teste `android-remaining` exigia
`/usr/bin/chromium`. Corrigido para usar o navegador gerenciado pelo Playwright,
com caminho alternativo somente quando explicitamente configurado. A execução
final passou e passou a preservar logs de falhas de interface como artefato.

Instalação manual sobre a versão de teste de assinatura estável, preservando o
mesmo identificador. Não há atualizador automático Android nesta versão.
Banco 6/backup 5. Permanecem pendentes os testes físicos no A56/Android 7,
incluindo migração, temporizador com tela apagada e TLS/LRCLIB; o sucesso real
do MusicBrainz no CI não valida o endpoint LRCLIB nem a conectividade do aparelho.

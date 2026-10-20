# Verificação das implementações solicitadas — 20/10/2026

> Registro do diagnóstico anterior às correções desta branch. Consulte a [situação atual e os limites de validação](CORRECOES_PENDENCIAS_2026-10-20.md).

## Resultado

As principais implementações continuam presentes e passaram nos cenários cobertos, mas **não é correto afirmar que todas funcionam integralmente**. Há funções aprovadas em testes controlados, pendências específicas de Windows, problemas já demonstrados no vídeo/auditoria e objetivos arquiteturais ainda parciais.

Esta verificação cobre os pedidos identificáveis no histórico da conversa e nas alterações/documentos do repositório. A numeração de listas antigas variou; o inventário abaixo identifica as funcionalidades pelo nome e mantém os números dos relatórios de personalização e atualizações quando há correspondência documentada. Não pressupõe requisitos ausentes do histórico disponível.

## Código local versus versão publicada

- Base examinada: `22ebe561af8460d33cd002d138d7b32fcd94f77e`, igual à `origin/main` consultada.
- Versão pública consultada: **2.0.6**. O workflow manual de publicação está aprovado no GitHub.
- O código local inclui adicionalmente a correção mais recente de `AlbumPage.tsx` e `styles.css`: capas das faixas, ícones distintos e agrupamento dos controles.
- Essas alterações recentes do álbum **ainda não estão no instalador público 2.0.6**. Não confundir o resultado do navegador local com o aplicativo já instalado.
- Nesta etapa não foi aplicada nova correção funcional, feito push ou gerado instalador. Foram executadas verificações e criado este documento.

Legenda: **Aprovado no escopo** significa que o cenário descrito passou; **Parcial** indica implementação existente com limite ou falha conhecida; **Pendente** indica ausência da comprovação necessária. Esses estados não representam homologação de todo o produto.

## 1. Frontend, navegação e migração inicial

| Implementação solicitada/registrada | Estado | Verificação e limite |
| --- | --- | --- |
| Ambiente com dependências e build utilizáveis | Aprovado no escopo | Frontend compila; testes Python/Rust e verificador de estrutura executam neste Linux. Não comprova desenvolvimento Tauri completo em Windows. |
| Nome e identidade visual BZtune | Aprovado no escopo | Regressões de identidade e compatibilidade de chaves/eventos passaram. Chaves históricas `doomvault-*` permanecem para preservar dados. |
| Navegação em cinco áreas e abas internas | Aprovado no escopo | Testes de integração e roteiros de navegação passaram; funções antigas continuam acessíveis. |
| Início com biblioteca e playlists, carregamento e nova tentativa | Aprovado no escopo | HTTP inválido, resposta inválida, falha de playlist isolada, resultados vazios e timeout com recuperação passaram no navegador. |
| Compartilhar o serviço de playlists e usar IPC no desktop | Aprovado no escopo | Transporte JS passou sem repetição HTTP de escritas; núcleo Rust e compatibilidade com SQLite Python passaram localmente. A verificação Windows do CI tem falha separada, descrita adiante. |
| Temas, tamanho de texto e responsividade da biblioteca | Aprovado no escopo | 81 combinações móveis de fonte/densidade/visualização passaram, incluindo títulos longos e ausência de overflow global nos cenários exercitados. |
| Foco da barra de pesquisa no contêiner correto | Aprovado no escopo | Contorno externo de 2/3 px conforme a preferência, sem contorno interno deslocado; roteiro passou. A gravação também não mostra o antigo retângulo interno. |
| Reorganização do CSS sem aumentar `!important` | Aprovado no escopo | Estrutura e regressões da cascata passaram; permanece a dívida de manutenção da folha grande. |
| Miniaturas nas músicas da aba do álbum | Aprovado localmente | Capas próprias e do álbum, alternativa para imagem inválida e quatro linhas com dados controlados verificadas. Ainda não publicadas. |
| Ícones diferentes para fila e tocar a seguir no álbum | Aprovado localmente | `ListEnd` para adicionar ao final e `SkipForward` para tocar a seguir; as ações efetivas também foram conferidas. Ainda não publicados. |
| Controles de álbum sem botão de playlist solto | Aprovado localmente | Nove combinações de largura/tema passaram. Desktop em uma linha e disposição explícita em tela estreita, mantendo ações de fonte local/online. |
| Remover a dependência de um servidor/backend separado | Parcial | Playlists já têm núcleo Rust; áudio, biblioteca, catálogo, downloads, estatísticas e backup ainda usam Python/HTTP. O sidecar é empacotado, mas o processo local continua existindo. |
| Preparação para Android | Pendente como aplicativo | O núcleo de playlists pode ser reaproveitado. Não há prova funcional de Android, armazenamento móvel, serviço de mídia/notificação ou reprodução com tela bloqueada. |

A consulta aos textos originais das análises não permite atribuir com segurança um nome a cada número 1–4 das primeiras mensagens de frontend. As funções identificadas foram conferidas por nome acima, sem inventar uma correspondência histórica.

## 2. Personalização — oito itens originais

| Item | Implementação | Resultado atual |
| --- | --- | --- |
| 1 | Paleta legível derivada da cor escolhida | Aprovada nas amostras e testes de contraste. Não é certificação de todo texto sobre imagens/gradientes. |
| 2 | Cobertura dos temas nas telas e inicialização | Aprovada nas telas/estados exercitados, incluindo tema salvo antes do React e modo Sistema nos testes de preferências. |
| 3 | Cor compartilhada entre player, biblioteca, playlists e atualizador | Aprovada em 48 combinações de tema/cor, incluindo cores extremas; menor contraste amostrado de conteúdo sobre preenchimento: aproximadamente 5,77:1. |
| 4 | Densidade e arredondamento | Aprovados em 54 combinações no roteiro de configurações e nas 81 combinações móveis da biblioteca. |
| 5 | Transparência, sombras e brilho independentes | Aprovados em 12 combinações com seis componentes por combinação, incluindo persistência e redefinição. |
| 6 | Reforçar o foco sem remover o indicador básico | Aprovado em seis casos, com 13 controles por caso. Contorno e nome da opção mantidos; preferência persiste. |
| 7 | Áreas de interação maiores | Aprovadas nas amostras dos controles e no roteiro de 54 perfis com ponteiro fino. Essas medidas de pixels CSS não equivalem a validação de toque em um Android real. |
| 8 | Aviso quando preferências não podem ser salvas, com nova tentativa | Aprovado em 30 casos de falha/recuperação manual e automática, incluindo persistência. |

Esses resultados não cobrem a persistência de todas as outras áreas do programa. A proteção da personalização não impede, por exemplo, a falha de `doomvault-last-tab` descrita nas pendências.

Também não concluem a revisão de todo contraste neutro do tema Escuro. Esse ponto já estava separado das oito correções originais.

## 3. Player, fila e recursos musicais anteriores

Foi gerado um MP3 sintético de 14 segundos e servido ao Chromium por respostas HTTP com suporte a Range. O navegador realmente carregou/decodificou o áudio nos elementos HTMLAudioElement; não foi uma simulação de retorno de `play()`. Os dados de catálogo e biblioteca usados no roteiro eram controlados. Não foi realizada avaliação acústica humana ou teste de dispositivo de saída.

| Recurso | Resultado |
| --- | --- |
| Restaurar a fila sem iniciar áudio automaticamente | Aprovado no roteiro. |
| Reproduzir e pausar áudio local | Aprovado; tempo avançou e os elementos pausaram ao comando. |
| Volume e silenciar/reativar | Aprovados, com leitura dos valores efetivos de volume nos elementos. |
| Buscar um trecho da faixa | Aprovado, com mudança de `currentTime`. |
| Próxima/anterior e troca entre arquivos locais | Aprovadas com os arquivos sintéticos. Não reproduziu o arquivo específico do vídeo. |
| “Adicionar à fila” versus “Tocar a seguir” | Aprovados nos testes da fila e na interface do álbum; ordem resultante foi conferida. |
| Adicionar músicas pela biblioteca dentro da fila | Aprovado, sem iniciar reprodução quando estava pausada. |
| Reordenar pelas setas sem trocar a faixa atual | Aprovado no roteiro. |
| Arrastar para reordenar no Windows | Correção local posterior aplicada: `dragDropEnabled: false` na janela principal. Arraste HTML5 e preservação da faixa passaram no Chromium; confirmação no novo instalador Windows continua pendente. |
| Remover itens da fila e preservar índices | Aprovado nos testes de operações da fila; não constitui teste de todas as combinações no WebView2. |
| Shuffle e repetição | Controles conectados e persistência de modos aprovados; lógica de índices/duplicatas coberta pela suíte. Não foi feita uma sessão longa para avaliar distribuição aleatória. |
| Mini-player, expandir e Escape | Aprovados nos roteiros de navegação. O corte de miniaturas observado no vídeo continua uma pendência visual específica. |
| Importação de letra LRC | Aprovada; linhas apareceram e o conteúdo foi salvo. |
| Histórico do player | Aprovado para exibição e registro no roteiro. Estatísticas agregadas têm limitações distintas, abaixo. |
| Equalizador local | AudioContext iniciou e controle de graves alterou/salvou o valor. Não foi avaliada qualidade acústica nem suporte em todos os dispositivos. |
| Crossfade local | Aprovado em transição sintética: os dois decks tocaram durante a sobreposição e a fila avançou. Não é homologação do crossfade em todos os arquivos/formatos. |
| Fechar player e selecionar novamente uma faixa | Aprovado no cenário adicional de reabertura. |
| Reprodução incorporada YouTube e alternativas | Implementação/contratos de recuperação preservados e testes de identificação passaram. Reprodução real de vídeos externos em WebView2 não foi exercitada aqui. |
| Faixa “NORMAL (Explicit Ver.)” travada em 0:00 no vídeo | Pendente de diagnóstico. O sucesso com MP3 sintético não explica nem corrige esse caso. |

## 4. Biblioteca, playlists, catálogo e dados

| Recurso | Resultado atual |
| --- | --- |
| CRUD, ordem e entradas locais/online de playlists | Aprovados nos testes funcionais Flask, no núcleo Rust e no contrato de interoperabilidade em Linux. |
| Duplicatas e respostas de inclusão em lote | Aprovadas nos testes; itens inválidos/duplicados são contabilizados e não devem ser confundidos com novas inclusões. |
| Importação MP3, streaming com Range e exclusão | Aprovados com arquivos sintéticos nos testes Flask. Isso não cobre todos os formatos reais de MP3/FLAC e todos os metadados existentes. |
| Preservar áudio/referências quando a exclusão falha | Simulação de bloqueio Windows e falha SQL passaram. O teste de bloqueio real de arquivo Windows foi ignorado neste Linux. |
| Editar/desfazer metadados e associação a álbum | Regressões passaram com banco temporário, incluindo preservação de IDs/capas e playlist. |
| Análise de duplicatas/versionamento musical | Regressões passaram, incluindo hashes, artistas diferentes, versões e remasterizações. |
| Pesquisa, artistas homônimos, rádio e alternativas | Identificação e contratos passaram com provedores simulados. Não confirma disponibilidade atual de YouTube Music/MusicBrainz nem completude de toda discografia. |
| Downloads/conversão | Código, mensagens, validações de identidade, fila e empacotamento continuam presentes. Download/conversão real de provedor externo não foi executado nesta etapa. |
| Avisos de download que podem ser fechados e deixam de persistir | Regressões de código passaram; não foi feita uma transferência externa real para validar toda a sequência do provedor. |
| Favoritos e coleção | Implementados e usados nos roteiros de interface. Falha de persistência ainda pode ser silenciosa nessas áreas. |
| Estatísticas e retrospectiva | Rotas e idempotência passaram nos testes; persistem os problemas de fonte efetiva, HTTP 500 e possível contagem com reprodução não confirmada. |
| Exportar ZIP e inspecionar/restaurar uma biblioteca estática de teste | Roundtrip aprovado no fluxo de fontes, com banco temporário. |
| Backup durante alteração da biblioteca | Reprovado na sonda de exclusão concorrente: ZIP foi aceito sem um áudio ainda referenciado pelo snapshot do SQLite. |
| Restaurar no desktop instalado sem código-fonte/Python | Não aprovado. O fluxo continua exigindo script e aponta para a estrutura da versão web. |
| Exportar/importar JSON de preferências | Implementado; importação ainda pode terminar parcialmente se uma gravação intermediária falhar. Não homologado como recuperação atômica. |

## 5. Atualizações — oito itens originais

| Item | Resultado atual |
| --- | --- |
| 1. Versão coerente entre interface e pacote | Parcial. A interface usa a versão efetiva do Tauri, e o build assinado sincroniza configuração/Cargo. O workflow legado `desktop-settings-205.yml` ainda força apenas a configuração para 2.0.5; não foi unificada a política de todos os builds. |
| 2. Timeout separado de consulta e download | Implementado e regressões aprovadas: 30 segundos para consulta e dez minutos para download. Não foi aguardado um timeout real de dez minutos no Windows nesta etapa. |
| 3. Recuperação do backend se o instalador não abrir | Implementada; testes dos helpers reais Rust com adaptadores de processo/sonda e tratamento visual passaram. Falha real do instalador em Windows não foi reproduzida aqui. |
| 4. Verificação criptográfica antes da publicação | Implementada; suíte de validação de pacote/assinatura e workflow passaram. O fluxo de publicação 2.0.6 está verde. |
| 5. Separar download, validação e entrega ao instalador | Aprovado nos testes de eventos, inclusive assinatura rejeitada e eventos atrasados. |
| 6. Foco/Tab/Escape/restauração na central | Aprovado em nove perfis de navegador, incluindo background inerte, controles ocupados e conclusão sem roubar foco. |
| 7. Upgrade HTTPS completo em Windows com dados preservados | Continua pendente. Manifesto e build publicados não substituem a instalação entre duas versões. |
| 8. Canal, versão e disponibilidade explícitos | Aprovado nos cinco estados de canal; preview e configuração desabilitada não consultam automaticamente. |

O respeito à preferência de consulta automática e a exigência de ação para instalação continuam implementados. A presença do recurso em um preview não habilita atualizações assinadas nesse binário.

## 6. Instalador e ciclo de vida desktop

- O workflow manual de publicação da **2.0.6** concluiu com sucesso: [execução no GitHub](https://github.com/BadZ7br/BZtune/actions/runs/39454759074). O manifesto público continua anunciando essa versão.
- Configuração NSIS por usuário, requisitos WebView2, empacotamento de Python/FFmpeg e atualização quiet continuam presentes; regressões estáticas passaram.
- A origem Tauri autorizada, health check e PNA passaram nos testes de integração isolados.
- Encerramento do processo gerenciado e recuperação são cobertos pelos testes; não foram observados processos reais do instalador neste Linux.
- O vídeo demonstra o aplicativo instalado aberto e navegável, mas não mostra um upgrade completo, uma instalação Windows limpa ou a versão do binário.
- O boot de desenvolvimento permanece incoerente: `BackendReady` começa falso e o debug não o libera. O frontend simulado chega ao erro após 45 segundos.
- A execução nativa Windows de [compatibilidade Python/Rust](https://github.com/BadZ7br/BZtune/actions/runs/39450285129) falhou. O traceback detalhado não estava acessível sem autenticação. Não foi determinado o motivo exato da falha.
- O fluxo por tag permanece incompatível com a proteção do ambiente `desktop-release`; o manual pela `main` foi o caminho de publicação que funcionou.

## 7. Problemas que continuam, sem relação com remoção de recursos

As sondas anteriores foram repetidas no código atual e continuaram mostrando:

1. Exceção ao salvar a última aba pode desmontar o React e deixar a tela vazia.
2. Resposta HTTP 200 de pesquisa sem a estrutura esperada também pode desmontar a interface.
3. Um backup pode ser aprovado sem um arquivo referenciado pelo banco se houver exclusão concorrente.
4. A configuração web de CORS aceita origem externa nas rotas comuns de playlists; a entrada desktop tem uma proteção adicional e não deve ser confundida com esse cenário web.
5. O modo debug pode ficar aguardando prontidão indefinidamente até o limite da interface.

Além deles, continuam registrados na [análise do repositório](ANALISE_REPOSITORIO_2026-10-20.md) e na [análise do vídeo](ANALISE_VIDEO_2026-10-20.md): escolha de gravação por título/artista ambíguos, cache do player sem invalidação adequada, falta de informação de erro na faixa do vídeo, carregamento que anuncia zero lançamentos, rolagem de detalhes e miniaturas cortadas.

Nenhum desses pontos foi considerado resolvido apenas porque as suítes existentes passaram.

## 8. Execuções desta verificação

| Verificação | Resultado |
| --- | --- |
| Build TypeScript/Vite de produção | Aprovado |
| Verificador de estrutura/imports/sintaxe | Aprovado |
| Testes JavaScript | 53 aprovados |
| Testes Python | 164 executados: 163 aprovados, 1 ignorado por exigir Windows |
| Testes do núcleo Rust | 8 aprovados |
| Interoperabilidade Python/Rust em SQLite temporário | Aprovada no Linux |
| Roteiros de navegador reaplicados | 13 aprovados, descritos abaixo |
| Player com MP3 sintético real | 13 etapas de comportamento e cenário adicional de fechar/reabrir aprovados |
| Sondas de erros conhecidos | Falhas condicionais reconfirmadas; não são resultado verde |

Os 13 roteiros de navegador abrangem: erros/retry do Início; foco da pesquisa; álbum em nove perfis; diálogo de atualização em nove perfis; cinco estados de canal; salvamento de preferências em 30 casos; configurações em 54 perfis; foco em seis casos/13 controles; efeitos em 12 combinações; densidade/cantos em 54 casos; 48 combinações de cor; cobertura de temas em 45 telas/estados, além da inicialização com tema salvo; e biblioteca móvel em 81 casos. As contagens se sobrepõem e não devem ser somadas como funcionalidades independentes.

Alguns roteiros temporários antigos ainda comparavam com uma altura de controle anterior à ampliação dos alvos, esperavam fundo opaco no updater ou consultavam o elemento externo do switch em vez do trilho/thumb atuais. Essas expectativas foram ajustadas somente nas cópias temporárias usadas na verificação. Foram preservadas as verificações de contraste, dimensionamento, temas, foco, ações e tratamento de erros; o código do produto não foi alterado para fazer um roteiro passar.

Os testes de UI usam respostas de serviços controladas. A reprodução sintética verifica o mecanismo local no Chromium, não a qualidade sonora nem o arquivo pessoal que falhou no Windows. Os dados de Flask/SQLite eram temporários; a biblioteca do usuário não foi modificada. O log Python contém a exceção SQL provocada intencionalmente pelo teste de recuperação; a suíte terminou aprovada.

## Encaminhamento

Não encontrei evidência de que as oito correções de personalização, a central de updates ou os controles principais de fila tenham sido removidos. Os testes também confirmaram a correção local mais recente do álbum.

O próximo trabalho deve tratar as falhas concretas e a diferença entre local e publicado: diagnosticar a faixa travada, corrigir o arraste Windows, garantir recuperação da interface/backup e validar o upgrade real. Não é necessário refazer as funcionalidades já aprovadas para resolver essas pendências.


## Correção posterior — primeira pendência: arraste da fila

A janela principal agora configura explicitamente `dragDropEnabled: false`. Isso desativa o handler nativo de drop do Tauri, que substitui o handler HTML5 do WebView2 no Windows. A fila existente continua usando seus eventos HTML5 para reordenar. Não foram encontrados consumidores de eventos nativos de drop no código atual; a importação existente usa seleção de arquivos.

Foi adicionado um teste de configuração em `test_desktop_packaging.py`, pois um teste de navegador sozinho não identifica essa diferença do Windows. Os cinco testes desse arquivo e os sete testes da lógica de fila passaram. Um roteiro Chromium com MP3 sintético realizou um arraste real pelo Playwright, conferiu a ordem resultante, manteve a faixa atual e o áudio em reprodução e restaurou a ordem pelas setas. O mesmo roteiro também conferiu reprodução, volume, pausa, busca, seleção na biblioteca, letras, equalizador e crossfade, sem exceções JavaScript.

Esta etapa altera configuração, teste e registro; não aplica correções às outras pendências. O aplicativo instalado ainda precisa receber um novo build e ser validado no WebView2. A faixa específica travada em `0:00 / 0:00` permanece como próxima investigação; este ajuste de arraste não é apresentado como solução para ela. Nenhum novo instalador foi gerado/publicado nesta etapa.

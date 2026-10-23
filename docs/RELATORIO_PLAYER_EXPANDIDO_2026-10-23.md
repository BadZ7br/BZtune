# Auditoria do player expandido do BZtune

**Atualização posterior:** os oito itens PE-01 a PE-08 foram corrigidos no workspace. Consulte [o registro das correções e testes](CORRECOES_PLAYER_EXPANDIDO_2026-10-23.md). O texto abaixo preserva os resultados da auditoria original.

Análise de 23/10/2026 sobre `main`, commit `f740d43`. Escopo: design, componentes React/CSS, reprodução local e online, letras, fila, ferramentas, APIs Python e playlists nativas. Nenhum código de produção foi corrigido ou publicado nesta análise.

**Parecer:** a separação das ferramentas e o rodapé persistente são uma boa base. O caminho normal passou pelos testes existentes, mas os testes adicionais reproduziram falhas de layout, acompanhamento de downloads, preservação da posição e tratamento de dados inválidos. Eu corrigiria PE-01, PE-02 e PE-03 antes de publicar outro instalador. Manteria o rodapé aprovado.

## O que foi executado

| Verificação | Resultado e alcance |
| --- | --- |
| Build TypeScript/Vite | Aprovado: `npm --prefix doomvault run build`. |
| Verificações de release | 201 casos Python executados: 200 aprovados e 1 exclusivo de Windows ignorado; 106 casos JavaScript aprovados. |
| Núcleo nativo Rust | 8 testes de integração de playlists aprovados com `cargo test --locked`. |
| Compatibilidade Rust/Python | `scripts/check_native_playlists.py` aprovado contra uma biblioteca temporária e o executável Rust recompilado. |
| Navegador | As 10 suítes existentes passaram: layout expandido, ferramentas, regressão de letras, relógio das letras, busca automática, recuperação online, prazos de playlists, contratos de respostas, cards da Home e backup. |
| Layout | A suíte verificou 9 combinações: 1920×1080, 1360×870, 960×640, 526×945, 390×844, 320×640, 1024×640 com fonte grande/espaçamento amplo e dois cenários locais. Probes adicionais mediram larguras de 320, 390, 768 e 1360 px. |
| Áudio no navegador | WAV silencioso real para seek, crossfade, repetição e troca de fonte. O relógio e os eventos do YouTube foram simulados. |
| Robustez adicional | Troca de música durante download, conclusão do download da faixa atual, alternativas com JSON inválido, histórico/equalizador inválidos no armazenamento, Escape em playlist, retorno de foco e corpos inválidos na API de download. Os defeitos encontrados estão abaixo. |
| Dependências | `npm audit --json`: 0 vulnerabilidades reportadas pelo registro nesta consulta. `pip check`: nenhuma dependência incompatível detectada. Isso não equivale a uma auditoria de vulnerabilidades Python/Rust. |

As APIs externas LRCLIB e YouTube foram consultadas diretamente, mas o proxy do ambiente bloqueou ambas as conexões HTTPS com erro de túnel 403. Os testes de provedores usaram respostas controladas; o transporte das letras também foi testado com um servidor HTTP local real, inclusive cancelamento e resposta lenta. Esse bloqueio do ambiente não demonstra indisponibilidade dos provedores para o usuário.

Não executei o aplicativo instalado no Windows/WebView2, um instalador nem Android. O teste ignorado verifica bloqueio real de arquivo no Windows; sua simulação multiplataforma passou. Nenhum arquivo da biblioteca do usuário ou download externo foi alterado.

Logs, probes e capturas estão em [audits/player-expandido-2026-10-23](audits/player-expandido-2026-10-23/README.md).

## Design e experiência

**O que está funcionando bem:** o rodapé mantém a ordem Letra, Fila, Equalizador, Histórico, Crossfade, Baixar e Mais; Minimizar e Fechar ficam separados. A ferramenta ativa recebe indicação visual e estado acessível. O rodapé permanece visível enquanto o conteúdo rola. A letra ganhou espaço e hierarquia própria. As configurações avançadas ficam no menu da letra. A fila admite arrastar e também reordenar por botões.

A troca de ferramenta preserva a superfície de reprodução. O download continua ao sair de Baixar para outra ferramenta, conforme a suíte existente. Playlists, favoritos e coleção reutilizam os serviços já existentes. Isso reduz a duplicação de fluxos.

**O que precisa melhorar:** a recuperação de reprodução sobrepõe os controles; os fluxos de fechamento pelo teclado são inconsistentes; Fechar tem uma consequência maior que o rótulo sugere. Em telas estreitas, o rodapé usa rolagem horizontal: a 320 px, a área das ferramentas tinha 170 px disponíveis para 498 px de conteúdo. Isso permite acessar os botões, mas convém sinalizar melhor a continuidade da barra, preservando seus itens, ordem e aparência.

## Itens priorizados

| ID | Prioridade | Área | Situação |
| --- | --- | --- | --- |
| PE-01 | Alta | Design/CSS | Botões das alternativas encobertos pelos controles. Reproduzido. |
| PE-02 | Alta | Frontend/download | Trocar de faixa perde o acompanhamento do download anterior. Reproduzido. |
| PE-03 | Alta | Reprodução/integração | Concluir download da faixa atual troca a fonte e perde a posição. Reproduzido. |
| PE-04 | Média | Contratos de API | Resposta inválida de alternativas derruba a área do player. Reproduzido com falha injetada. |
| PE-05 | Média | Persistência | Histórico/equalizador com estrutura inválida derrubam a área do player. Reproduzido com dados sintéticos. |
| PE-06 | Média | Teclado/acessibilidade | Escape minimiza o player em vez de fechar a playlist; fechar ferramenta perde o foco. Reproduzido. |
| PE-07 | Média | Backend | API de download aceita metadados inválidos e devolve 500 para alguns corpos JSON. Reproduzido. |
| PE-08 | Média | Experiência | Fechar esvazia a fila persistida. Comportamento confirmado; requer decisão de UX. |

### PE-01 — Alternativas de reprodução ficam encobertas

Ao expandir e abrir “Vídeo não reproduz? Ver alternativas”, o painel ocupa uma superfície com altura mínima de 400 px, mas o contêiner de mídia continua dimensionado pela proporção 16:9. Os controles seguintes ocupam parte da mesma área.

A 1360 px, a mídia media aproximadamente 233 px de altura e a superfície interna 400 px. No centro do botão “Procurar outra gravação”, o navegador encontrava o título da música. A 390 px, encontrava o indicador de fonte. O clique normal do Playwright expirou por interceptação de ponteiro; não foi necessário inventar uma falha da API para demonstrar o problema visual.

**Impacto:** a opção de recuperação aparece, mas o usuário pode não conseguir acioná-la com o mouse/toque.

**Origem:** [styles.css](../doomvault/src/styles.css#L10422), especialmente a relação com a regra `:has(.bz-online-recovery)` em [linha 11073](../doomvault/src/styles.css#L11073).

**Correção recomendada:** fazer o painel participar do dimensionamento do layout ou colocá-lo em uma área própria, com altura e rolagem coerentes. Apenas aumentar o `z-index` pode esconder controles em vez de resolver a geometria. Validar todos os botões com clique normal em desktop e janela estreita, mantendo o rodapé.

Capturas reais com dados de teste: [1360 px](audits/player-expandido-2026-10-23/recovery-1360.png) e [390 px](audits/player-expandido-2026-10-23/recovery-390.png).

### PE-02 — Download perde seu acompanhamento ao trocar de música

Reprodução: iniciar download da faixa A, avançar para B, concluir A no backend simulado e retornar para A. O número de consultas permaneceu em 1 mesmo após 2,7 segundos; nenhum evento de atualização da biblioteca foi emitido pelo componente; A voltou a exibir o botão de iniciar download.

**Causa:** [CatalogDownloadButton.tsx:42](../doomvault/src/library/CatalogDownloadButton.tsx#L42) limpa o identificador e o estado quando os metadados mudam. O efeito de consulta é encerrado. O backend pode continuar trabalhando, mas esse componente deixa de acompanhar a conclusão.

**Impacto:** progresso e confirmação desaparecem, a atualização imediata da biblioteca não é disparada por esse fluxo e o usuário pode repetir a solicitação. O backend possui proteção contra duplicação da faixa em andamento; portanto, o teste não comprova criação de arquivos duplicados.

**Correção recomendada:** manter os trabalhos em um gerenciador independente da faixa exibida, associados a `batchId` e identidade da faixa. A conclusão deve atualizar a biblioteca mesmo após troca de faixa ou fechamento do painel. Respostas tardias do início de um download também devem manter o vínculo com a faixa que originou a solicitação.

### PE-03 — Download concluído muda a fonte e zera a posição

Reprodução: manter uma faixa online em 65 segundos e concluir seu download. A atualização da biblioteca disponibiliza uma correspondência local confirmada. O player passa para “ÁUDIO OFFLINE” e a posição muda de 65 para 0 segundos. O WAV carregado estava pronto, com `currentTime = 0`; não foi apenas uma atualização errada do texto da barra.

**Causa:** [MusicPlayer.tsx:164](../doomvault/src/player/MusicPlayer.tsx#L164) recalcula automaticamente a fonte usando a biblioteca. O efeito que ativa o áudio local em [linha 463](../doomvault/src/player/MusicPlayer.tsx#L463) usa a posição inicial do novo elemento, sem transferir a posição online.

**Impacto:** baixar a música que está aberta interrompe a continuidade da audição ou perde a posição pausada.

**Correção recomendada:** preferir a fonte local na próxima ativação da faixa, mantendo a fonte da sessão atual estável. Caso a troca imediata seja desejada, transferir posição e estado de pausa/reprodução após validar a identidade da gravação e carregar os metadados. Testar também download em segundo plano e atualização da biblioteca por outros caminhos.

### PE-04 — Contrato inválido de alternativas derruba o player

Uma resposta HTTP 200 com `{"tracks":"invalid"}` é aceita pelo frontend. Ao renderizar, `options.map` provoca `TypeError`, exibindo “Falha em Player”. A barreira de erro preserva outras áreas do aplicativo, mas desmonta a reprodução daquele componente.

**Origem:** [OnlinePlaybackRecovery.tsx:45](../doomvault/src/player/OnlinePlaybackRecovery.tsx#L45) faz apenas uma conversão de tipo TypeScript; [linha 72](../doomvault/src/player/OnlinePlaybackRecovery.tsx#L72) pressupõe uma lista válida. Conversões com `as` não validam JSON em execução.

**Correção recomendada:** validar envelope, lista e campos de cada gravação antes de atualizar o estado; exibir erro recuperável dentro do painel. Aplicar a mesma disciplina às respostas de início/andamento de download, hoje também convertidas sem validação completa. Cancelar a busca de alternativas ao sair/trocar a identidade evita trabalho desnecessário; não observei contaminação de uma faixa nova por resposta antiga neste teste.

O backend normal já constrói uma lista de alternativas; este resultado demonstra fragilidade diante de uma resposta inesperada, não que a API produza esse erro normalmente.

### PE-05 — Dados persistidos inválidos impedem abrir ferramentas

Com `doomvault-listening-history-v11` contendo JSON `null`, abrir Histórico derruba a área do player. O mesmo ocorre ao abrir Equalizador com `doomvault-eq-v11 = null`.

**Causa:** [MusicPlayer.tsx:73](../doomvault/src/player/MusicPlayer.tsx#L73) protege contra JSON malformado, mas não valida sua estrutura. Histórico e equalizador recebem o valor diretamente em [linha 129](../doomvault/src/player/MusicPlayer.tsx#L129) e [linha 145](../doomvault/src/player/MusicPlayer.tsx#L145). Depois acessam `.length`, `.filter` ou índices presumindo o formato correto.

**Impacto:** uma preferência inválida pode bloquear o player repetidamente; a recuperação da barreira de erro não corrige o valor salvo.

**Correção recomendada:** validar lista de histórico e seus membros, limitar os itens e exigir três ganhos numéricos finitos no intervalo permitido. Recuperar somente a preferência inválida para um padrão seguro, preservando fila, biblioteca e demais configurações.

### PE-06 — Fechamento por teclado e retorno de foco inconsistentes

Com “Escolher playlist” aberto e foco em uma playlist, pressionar Escape minimiza todo o player. Ao expandir e voltar a Mais, o seletor continua aberto. O menu de letras, em comparação, já trata Escape e devolve foco ao acionador.

Fechar a ferramenta Histórico pelo botão de fechar também deixa `document.activeElement` no `BODY`, em vez de devolver o foco ao botão Histórico do rodapé.

**Origem:** listener global em [MusicPlayer.tsx:647](../doomvault/src/player/MusicPlayer.tsx#L647), seletor em [AddToPlaylistButton.tsx:53](../doomvault/src/playlists/AddToPlaylistButton.tsx#L53) e fechamento da ferramenta em [MusicPlayer.tsx:919](../doomvault/src/player/MusicPlayer.tsx#L919). O seletor local tem estrutura equivalente.

**Correção recomendada:** fechar primeiro a interface interna ativa e devolver foco ao seu acionador. Minimizar com Escape somente quando nenhuma interface interna consumir o evento. Ao fechar uma ferramenta, devolver foco ao item correspondente do rodapé. Preservar a operação de playlist em andamento.

### PE-07 — Validação de entrada insuficiente na API de download

Em um Flask real isolado, com a criação de threads substituída por mock:

| Corpo enviado a `POST /api/library/auto-download` | Resultado observado |
| --- | --- |
| Lista não vazia, como `[1]` | HTTP 500, sem erro JSON estruturado. |
| Texto JSON, como `"bad"` | HTTP 500. |
| `artist` e `title` iguais a `null`, tipo `track` | HTTP 202; worker receberia os textos `"None"`. |
| Artista/título numéricos | HTTP 202; números convertidos para texto. |
| Artista/título vazios | HTTP 400, corretamente. |
| Quatro pedidos válidos com três lotes ativos | 202, 202, 202 e 429, corretamente. |

**Causa:** [auto_catalog_api.py:191](../doomvault-api/api/auto_catalog_api.py#L191) pressupõe objeto JSON e converte metadados com `str()` antes de validá-los.

**Correção recomendada:** exigir objeto JSON, strings não vazias e limites explícitos; validar os campos opcionais e o identificador de vídeo antes de criar o lote. Retornar HTTP 400 com mensagem consistente. Nenhuma thread real ou chamada ao YouTube foi iniciada por esse probe.

### PE-08 — Fechar também apaga a fila

O botão Fechar chama `clearQueue()` em [MusicPlayer.tsx:1056](../doomvault/src/player/MusicPlayer.tsx#L1056). A fila é esvaziada e esse estado é persistido. No probe com WAV local, o áudio parou e a fila salva ficou com zero itens.

**Avaliação:** o comportamento pode ser intencional, mas “Fechar” não deixa clara a perda da fila. Trata-se de uma decisão de experiência, não de um crash.

**Recomendação:** manter Minimizar para recolher a interface e definir explicitamente se Fechar deve apenas parar a reprodução ou também limpar a fila. Se limpar for a intenção, explicar isso no nome acessível/tooltip e oferecer desfazer, preservando o desenho e a posição do botão.

## Leitura do frontend

O player usa React/TypeScript e JSX; não há uma página HTML separada para cada ferramenta. O motor, estado das ferramentas e grande parte da interface ficam em `MusicPlayer.tsx`, atualmente com 1.104 linhas. O CSS global tem 11.122 linhas; esse total inclui o restante do aplicativo, não só o player. Existem regras antigas e recentes que atingem os mesmos elementos e 185 ocorrências de `!important`.

O problema PE-01 exemplifica o risco de regras locais resolverem a altura de um elemento sem ajustar seus contêineres. A suíte de layout existente verifica limites, mas não exercitava os botões dentro do painel de alternativas nessa composição. Há também testes que verificam trechos de código/CSS; eles ajudam a impedir mudanças conhecidas, mas não substituem interações reais.

Recomendaria separar gradualmente motor de reprodução, letras, trabalhos de download e apresentação das ferramentas, preservando os elementos de mídia entre trocas de painel. Consolidaria as regras CSS do player por componente/breakpoint após corrigir os defeitos. Isso não exige trocar de framework nem refazer todas as telas.

## Backend e dependências do player

| Função | Onde funciona hoje | Avaliação |
| --- | --- | --- |
| Reprodução online | YouTube IFrame API na WebView | Depende de rede, disponibilidade e permissão de incorporação. Recuperação possui prazo/retry; painel precisa de PE-01/PE-04. |
| Reprodução local e seek | Dois elementos HTMLAudio; Flask serve o arquivo com resposta condicional/Range | Teste Flask confirmou HTTP 206 e bytes corretos. WAV real confirmou seek e repetição no Chromium. |
| Equalizador | Web Audio no frontend, três bandas | Restrito a áudio local. Não é processamento Python/Rust nem atua sobre o YouTube. |
| Crossfade | Dois elementos de áudio e controle de volumes no frontend | Transição local aprovada com WAV real; desativada para Shuffle/Repeat One conforme regra existente. |
| Letras | React + serviço de letras; Flask/httpx para LRCLIB | Cache, LRC importado, seleção de versões, prazos, cancelamento, limites e tratamento de 429 têm cobertura existente aprovada. |
| Downloads | Flask + ytmusicapi + yt-dlp + FFmpeg; persistência da biblioteca em SQLite | Há limite de 3 lotes ativos e 2 downloads de mídia simultâneos, identificação da gravação e proteção contra duplicação. PE-02/PE-03/PE-07 precisam de ajuste. |
| Playlists | Serviço frontend; Rust/SQLite no Tauri, HTTP no modo de navegador | 8 testes Rust e compatibilidade Python/Rust aprovados. A ponte WebView2 completa não foi executada aqui. |
| Favoritos/coleção | Estado existente do aplicativo e identificação do álbum carregado | As ações são de álbum, não de favoritar a faixa individual. Dependem de o álbum ser identificado no catálogo disponível. |

O desktop inicia seu backend Python como processo gerenciado pelo Tauri, em loopback; o usuário não precisa abri-lo manualmente. Isso ainda é uma arquitetura híbrida: o áudio local usa HTMLAudio/Web Audio, a reprodução online usa iframe e parte dos serviços continua em Flask. A análise não encontrou motivo para reescrever tudo apenas para melhorar o player expandido.

As dependências diretas Python estão fixadas em versões; o instalador tem lock próprio, incluindo Waitress. O frontend possui lockfile e passou pelo build/audit. FFmpeg continua sendo uma dependência operacional do download. `pip check` valida compatibilidade de pacotes, não presença/funcionamento do FFmpeg no Windows. Não executei auditoria CVE de Python/Rust nem testes de codecs/dispositivos no Windows.

**Risco de manutenção observado por leitura:** os lotes e jobs de download ficam em memória; não identifiquei expiração de lotes concluídos nessa rota nem restauração do andamento após reiniciar o processo. Existe limite para lotes ativos, portanto não há base para afirmar downloads ativos ilimitados. Retenção limitada e reconciliação dos trabalhos são melhorias futuras; não medi vazamento ou esgotamento de memória nesta sessão.

## Melhorias de produto após os defeitos

- **Histórico:** a frase “Volte às músicas” sugere reproduzir, mas as linhas são informativas; há somente a ação de limpar. A lista exibe até 12 dos 50 registros mantidos e não oferece acesso aos demais. Adicionar tocar/tocar a seguir/colocar na fila e uma forma de ver mais, ou ajustar a promessa da tela. Isso é uma limitação confirmada pela implementação, não uma regressão demonstrada nesta auditoria.
- **Equalizador:** abrir a ferramenta já tenta ativá-lo para áudio local, mas o botão continua dizendo “Ativar equalizador”. Exibir estado ativo, opção de desativar temporariamente e restaurar bandas tornaria o resultado mais claro.
- **Mais:** deixar explícito que Favoritos e Coleção se referem ao álbum. Para uma faixa cujo álbum ainda não está identificado no catálogo carregado, os botões ficam desabilitados. Uma resolução automática por identificador evitaria exigir que o usuário abrisse o álbum antes.
- **Crossfade:** além da duração salva, mostrar a disponibilidade efetiva da transição para o par atual/próximo, inclusive quando a próxima é online. O texto atual explica a limitação, mas a duração ajustada pode parecer uma confirmação de que a próxima transição ocorrerá.
- **Rodapé estreito:** acrescentar um indício discreto de rolagem e assegurar acesso por teclado a todos os itens sem mudar a ordem ou remover ferramentas.

## Ordem de trabalho recomendada

1. PE-01: tornar todos os controles de recuperação clicáveis.
2. PE-02: separar o ciclo de vida do download da faixa exibida.
3. PE-03: preservar fonte/posição durante a atualização da biblioteca.
4. PE-04 e PE-05: validar dados antes de entrarem no estado do player.
5. PE-06 e PE-07: acertar teclado/foco e validação da API.
6. PE-08: definir a consequência de Fechar e torná-la clara.
7. Melhorar Histórico, Equalizador e Mais mantendo o rodapé aprovado; consolidar CSS e componentes gradualmente.

Cada correção deve incluir uma verificação do comportamento que falhou. Para PE-01, o clique real é essencial; para PE-02/PE-03, a biblioteca precisa realmente mudar no cenário de teste. Repetir apenas os testes atuais não demonstra que esses problemas foram resolvidos.

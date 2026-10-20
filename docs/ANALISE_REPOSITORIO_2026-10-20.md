# Análise minuciosa do BZtune — 20/10/2026

> Registro do diagnóstico anterior às correções desta branch. Consulte a [situação atual e os limites de validação](CORRECOES_PENDENCIAS_2026-10-20.md).

## Parecer

O BZtune já tem uma base funcional de aplicativo musical desktop: biblioteca SQLite, reprodução híbrida, playlists mistas, personalização e distribuição assinada. O ponto mais frágil agora é a confiabilidade em situações de erro e de mudança de estado: armazenamento indisponível, resposta inesperada da API, alterações durante backup e troca de fonte musical.

O projeto ainda está em transição arquitetural. As operações de playlists usam Rust no desktop; biblioteca, áudio, capas, catálogo, downloads, estatísticas e backup continuam apoiados no Python/HTTP. A instalação empacota esse serviço, dispensando um terminal para o usuário, mas o processo e a porta local continuam existindo. React dentro da WebView é parte da arquitetura do Tauri; migrar os serviços para Rust reduz a dependência do servidor sem eliminar a WebView.

Minha recomendação é estabilizar dados, inicialização e reprodução antes de acrescentar funções ou começar o aplicativo Android. Não atribuo uma nota numérica: não seria uma medida confiável sem uso prolongado e testes reais de instalação/reprodução.

## Escopo e estado verificado

- Repositório: `BadZ7br/BZtune`, `main`, commit `22ebe561af8460d33cd002d138d7b32fcd94f77e`. A referência remota foi atualizada e corresponde ao código examinado.
- Revisão: frontend, launcher Tauri, núcleo Rust, rotas/serviços Python, persistência, backup, workflows e documentação. São 175 arquivos rastreados; não foi realizada uma auditoria de cada linha do histórico Git.
- Verificações locais: Linux, Chromium com respostas e ponte nativa simuladas, testes existentes e sondas adicionais sobre dados sintéticos em diretórios temporários.
- Não houve alteração funcional, execução de instalador ou uso de biblioteca pessoal nesta análise. Este relatório foi criado localmente.
- Datas deste relatório usam o calendário do usuário em São Paulo.

**A publicação mudou desde o último retorno:** a [execução manual de publicação](https://github.com/BadZ7br/BZtune/actions/runs/39454759074) terminou com sucesso no commit examinado. O manifesto HTTPS anunciou **2.0.6**, `windows-x86_64`, assinatura e URL do instalador. Uma requisição HEAD ao instalador retornou HTTP 200 e tamanho de 89.062.148 bytes. Não baixei nem verifiquei localmente os bytes do executável; o workflow inclui sua própria verificação criptográfica.

A [Release 2.0.6](https://github.com/BadZ7br/BZtune/releases/tag/v2.0.6) está disponível. Isso comprova publicação e disponibilidade dos arquivos consultados, não comprova instalação, upgrade ou preservação de dados em um Windows real. Esses cenários continuam no [roteiro de aceitação](../desktop/HTTPS_UPDATE_ACCEPTANCE.md).

## Pontos fortes que vale preservar

1. **Migração gradual com contrato comum.** `services/playlists.ts` concentra o transporte; uma escrita nativa que falha não é repetida por HTTP. O núcleo Rust é independente de Tauri e pode ser compartilhado com outra plataforma.
2. **Cuidado com dados.** Há transações, foreign keys, identificação por hash, migração de playlists marcada e restauração com preparação e cópia anterior. Os problemas encontrados abaixo são lacunas específicas, não ausência completa dessas proteções.
3. **Atualizações assinadas.** O pacote é verificado na publicação e no cliente. Consulta/download têm limites nativos; há recuperação do serviço se a abertura do instalador falhar, com etapas visuais distintas.
4. **Melhora de acessibilidade e personalização.** Preferências são normalizadas; tema é aplicado antes da montagem; paletas tratam contraste; controles receberam áreas de toque e foco. A central usa diálogo modal com gerenciamento de teclado.
5. **Testes além de sintaxe.** Existem testes funcionais Flask com banco temporário, testes Rust de persistência/concorrência e verificação entre Python e Rust. A auditoria npm do frontend retornou zero vulnerabilidades conhecidas na consulta realizada.
6. **Escopo de permissões contido.** A capability do desktop não expõe comandos shell ao frontend. O backend instalado fica em loopback e bloqueia origens externas na entrada desktop.

## Problemas e prioridades

P1 significa corrigir antes de ampliar o uso/distribuição; P2, próxima rodada de estabilidade; P3, manutenção planejada. “Reproduzido” identifica uma sonda executada nesta análise. “Confirmado no código” não significa reprodução em um computador Windows.

| Item | Prioridade | Achado | Evidência |
| --- | --- | --- | --- |
| 1 | P1 | Falha de armazenamento pode apagar toda a interface | Reproduzido no Chromium |
| 2 | P1 | JSON de pesquisa inesperado derruba a aplicação | Reproduzido no Chromium |
| 3 | P1 | Inicialização Tauri de desenvolvimento não libera a interface | Código + simulação do boot |
| 4 | P1 | Restauração não atende à biblioteca do desktop instalado | Confirmado no código/empacotamento |
| 5 | P1 | Backup pode ser aceito faltando áudio referenciado pelo SQLite | Reproduzido com exclusão concorrente simulada |
| 6 | P1 | Correspondência automática pode reproduzir outra gravação | Reproduzido com a expressão real do player |
| 7 | P1 | Compatibilidade Windows falha sem impedir publicação | Confirmado nas execuções do GitHub |
| 8 | P2 | API da versão web aceita origem externa em operações de playlists | Reproduzido nas rotas reais com CORS equivalente ao app |
| 9 | P2 | Cache do player não acompanha importação, exclusão ou recuperação | Confirmado no código |
| 10 | P2 | Estatísticas não representam sempre reprodução/fonte confirmadas | Código + sonda de HTTP 500 |
| 11 | P2 | Telas ocultas continuam consultando serviços e faltam limites de espera | Código + observação no Chromium |
| 12 | P2 | Persistência e importação JSON têm falhas silenciosas/parciais | Confirmado no código |
| 13 | P2 | WebView está sem política CSP e carrega script remoto no contexto principal | Confirmado na configuração/player |
| 14 | P2 | Builds não são reproduzíveis em todas as dependências | Confirmado nos manifests/scripts |
| 15 | P2 | Fluxo de publicação por tag conflita com regras do ambiente | Rejeição explícita do GitHub |
| 16 | P3 | CSS, textos e documentação acumulam conceitos antigos | Confirmado no código/documentação |

### 1. Falha de armazenamento pode apagar toda a interface

**Fontes:** [App.tsx](../doomvault/src/App.tsx), linhas 125 e 128; [MusicPlayer.tsx](../doomvault/src/player/MusicPlayer.tsx), linha 260.

A leitura da última aba e sua gravação não são protegidas; a leitura de letras também acessa `localStorage` diretamente. Simulei `SecurityError` somente ao salvar `doomvault-last-tab`: o React desmontou o conteúdo e `#root` ficou vazio. A proteção de salvamento da personalização não cobre esses acessos.

**Ação:** centralizar acesso seguro ao armazenamento, manter a navegação funcionando em memória e informar quando não houver persistência. Adicionar contenção de erros no React para preservar uma tela de recuperação.

**Aceitação:** bloquear leitura/gravação não pode resultar em tela vazia; navegar e ouvir devem continuar possíveis.

### 2. JSON de pesquisa inesperado derruba a aplicação

**Fontes:** [UniversalSearch.tsx](../doomvault/src/pages/UniversalSearch.tsx), linhas 40 e 47–49; [main.tsx](../doomvault/src/main.tsx).

A resposta é convertida com `as Payload`, que não valida JSON em execução. O acesso `data?.results.artists` protege `data`, mas não um `results` ausente. Uma resposta HTTP 200 com `{"query":"audit"}` provocou `Cannot read properties of undefined (reading 'artists')` e deixou `#root` vazio. Não encontrei um Error Boundary no frontend.

**Ação:** validar a estrutura no serviço antes de atualizar estado, tratar erro de contrato e aplicar limites de erro por área. Estender o padrão já usado na home para pesquisa, detalhes e estatísticas.

**Aceitação:** resposta inválida deve mostrar falha e permitir repetir; navegação e player devem permanecer disponíveis.

### 3. Inicialização Tauri de desenvolvimento não libera a interface

**Fontes:** [main.rs](../desktop/src-tauri/src/main.rs), linhas 290–300; [main.tsx](../doomvault/src/main.tsx), linhas 51–80.

`BackendReady` começa falso. No modo debug, o setup apenas mostra a janela: não inicia o backend nem valida/marca pronto um servidor externo. O frontend exige `desktop_backend_ready === true` antes de realizar seu fetch de confirmação. Assim, iniciar o Flask manualmente não libera esse caminho.

Na simulação da ponte retornando o estado inicial do debug, o boot terminou após 45 segundos sem executar uma consulta à API e sem montar o aplicativo. A reprodução foi do frontend; não executei `tauri dev` completo neste Linux.

**Ação:** definir explicitamente o protocolo de desenvolvimento: validar o servidor externo sem assumir posse do processo, ou gerenciar um serviço de desenvolvimento. Só liberar a interface após uma validação coerente.

**Aceitação:** `tauri dev` com o servidor esperado acessível deve abrir a interface; serviço ausente deve oferecer recuperação útil.

### 4. Restauração não atende à biblioteca do desktop instalado

**Fontes:** [DataToolsPage.tsx](../doomvault/src/features/DataToolsPage.tsx), função `stageZip`; [restaurar_bztune.py](../scripts/restaurar_bztune.py), linhas 62–75; [backend_entry.py](../desktop/backend_entry.py); [prepare_windows.ps1](../desktop/scripts/prepare_windows.ps1).

A biblioteca instalada fica em `%LOCALAPPDATA%/BZtune/library` ou na substituição configurada. O script de restauração exige uma árvore de fontes com `doomvault/package.json` e `doomvault-api/app.py`, e fixa o destino em `doomvault-api/doomvault_library`. O instalador não entrega esse checkout nem um fluxo para executar o script pelo aplicativo.

O ZIP pode ser exportado/preparado no desktop, mas o caminho de restauração orientado na interface não restaura a biblioteca instalada. O problema é destino e disponibilidade do fluxo; não há evidência de dados já perdidos por um usuário.

**Ação:** oferecer restauração nativa para o diretório realmente usado pelo app, com encerramento controlado do serviço, validação, preparação no mesmo volume, cópia anterior e recuperação em caso de falha. O caminho deve vir do aplicativo, não de uma string arbitrária enviada pela WebView.

**Aceitação:** um Windows sem Python/Node/código-fonte deve conseguir restaurar uma biblioteca de teste exclusivamente pelo programa.

### 5. Backup pode ser aceito faltando áudio referenciado pelo SQLite

**Fonte:** [bztune_backup.py](../doomvault-api/services/bztune_backup.py), funções `create_backup`, `_data_files` e `inspect_backup`.

O SQLite recebe um snapshot consistente, mas a coleta dos arquivos acontece depois, sem uma coordenação comum com importação/exclusão. Simulei uma exclusão entre o snapshot do banco e a enumeração de áudio. A exportação terminou, `inspect_backup` retornou `ok=true`, mas o SQLite exportado ainda referenciava `demo.mp3`, ausente no ZIP.

Os hashes confirmam os membros presentes; não confirmam a correspondência entre o banco e a mídia. Uma modificação do arquivo entre escrita no ZIP e cálculo do hash também não está coordenada.

**Ação:** definir um protocolo de snapshot de banco e arquivos, coordenar as escritas e validar referências essenciais antes de anunciar sucesso. O bloqueio precisa abranger os escritores Python e Rust pertinentes; um mutex isolado em um único processo não resolve sozinho a concorrência entre ambos.

**Aceitação:** exportar durante importação/exclusão deve produzir um conjunto coerente ou falhar claramente, nunca aprovar referências sem o áudio esperado.

### 6. Correspondência automática pode reproduzir outra gravação

**Fontes:** [MusicPlayer.tsx](../doomvault/src/player/MusicPlayer.tsx), linhas 300–301 e 357–358; [library-availability.ts](../doomvault/src/library/library-availability.ts), `matchLocalTracks` e `confirmedLocalMatch`.

O player procura primeiro o ID de origem e depois o primeiro título/artista normalizado. O fallback não considera álbum ou ambiguidade. Com duas faixas sintéticas de mesmo título/artista, `Live` antes de `Studio`, uma solicitação do álbum `Studio` selecionou `Live`.

O projeto já possui um serviço que distingue correspondência confirmada de indício por nome, mas o resolver principal e o pré-carregamento não o usam. Isso pode fazer o indicador offline e a música efetivamente escolhida seguirem regras diferentes.

**Ação:** unificar resolução e pré-carregamento no contrato de identidade; priorizar ID e confirmação inequívoca, e pedir escolha quando houver ambiguidade.

**Aceitação:** gravações de estúdio, ao vivo e remasterizações não podem ser intercambiadas silenciosamente.

### 7. Compatibilidade Windows falha sem impedir publicação

**Fontes:** [execução da matriz nativa](https://github.com/BadZ7br/BZtune/actions/runs/39450285129), [job Windows](https://github.com/BadZ7br/BZtune/actions/runs/39450285129/job/118722968526), [native-core.yml](../.github/workflows/native-core.yml), [desktop-release.yml](../.github/workflows/desktop-release.yml).

A matriz Linux passou, mas o job Windows falhou em **Verify native and Python database compatibility**, com código de saída 1. A publicação manual do mesmo commit passou por outro workflow. O fluxo de publicação não executa essa verificação de interoperabilidade nem depende da conclusão dessa matriz.

Os logs detalhados exigiram autenticação indisponível neste ambiente. Portanto, a etapa com falha está confirmada; sua causa exata não foi determinada. Há conexões SQLite Python sem fechamento explícito no verificador e nas rotas, algo a investigar em Windows, mas isso não comprova a causa desse erro.

**Ação:** obter o traceback da etapa, corrigir a causa e tornar a compatibilidade real Python/Rust um requisito da publicação. Fechar conexões explicitamente; o context manager de `sqlite3.Connection` trata transação, não garante `close()`.

**Aceitação:** Linux e Windows devem passar o mesmo contrato em banco temporário antes da distribuição. Não remover a verificação para deixar o workflow verde.

### 8. API web aceita origem externa em operações de playlists

**Fontes:** [app.py](../doomvault-api/app.py), `CORS(app)`; [playlists_api.py](../doomvault-api/api/playlists_api.py); [backend_entry.py](../desktop/backend_entry.py), `desktop_origin_guard`.

A restrição global de origens existe na entrada desktop; o blueprint de funcionalidades também tem uma restrição própria. As rotas comuns de biblioteca/playlists, quando servidas pelo `app.py` web, não recebem essa restrição global e usam CORS permissivo.

Com o blueprint real e o CORS configurado como no app, um POST de origem `https://audit.invalid` criou uma playlist sintética com HTTP 201 e `Access-Control-Allow-Origin` para essa origem. Isso confirma a política do servidor, não uma exploração completa em todos os navegadores: permissões de rede local/PNA podem interferir. No desktop instalado, a entrada própria bloqueia essa origem externa.

**Ação:** aplicar uma política única ao servidor inteiro e às rotas mutáveis, mantendo apenas as origens necessárias. Não usar CORS como autenticação; definir também a política para requisições sem Origin e clientes locais.

**Aceitação:** origens externas não devem ler nem modificar a biblioteca na configuração web suportada; WebView e desenvolvimento autorizado devem continuar funcionando.

### 9. Cache do player não acompanha importação, exclusão ou recuperação

**Fonte:** [MusicPlayer.tsx](../doomvault/src/player/MusicPlayer.tsx), linhas 106, 291 e 306–309.

A resolução é armazenada em um `Map` e inclui resultados negativos e falhas transitórias da API. O efeito depende da chave da faixa. Esse cache não é invalidado pelo evento `doomvault-library-updated`, embora a disponibilidade da biblioteca use esse evento.

Depois de uma falha temporária, o mesmo item pode continuar tratado como online mesmo com o arquivo disponível. Depois de uma exclusão, pode continuar apontando para um áudio inexistente. A escolha manual de outra fonte pode contornar parte dos casos, mas não corrige a resolução automática.

**Ação:** usar cache compartilhado com invalidação/revisão de biblioteca, expiração de resultados negativos e tratamento diferente para erro de serviço e ausência confirmada.

**Aceitação:** importar, excluir e recuperar conexão deve atualizar a próxima tentativa da mesma música sem exigir reiniciar o app.

### 10. Estatísticas não representam sempre reprodução/fonte confirmadas

**Fontes:** [ListeningTracker.tsx](../doomvault/src/features/ListeningTracker.tsx), linhas 35 e 39–46; [MusicPlayer.tsx](../doomvault/src/player/MusicPlayer.tsx), tratamento de `play()` e `onError`.

O tracker marca o progresso como enviado antes da resposta e não verifica `response.ok`. Na sonda, HTTP 500 para dez segundos acumulados foi tratado como envio concluído; encerrar a sessão não repetiu aquele progresso. Requisições posteriores podem corrigir o acumulado se a sessão continuar, mas não garantem o registro final.

A fonte é inferida do item original. Quando o player resolve uma cópia local para uma referência online, o contexto pode continuar classificando a sessão como online. Além disso, falhas de áudio local nem sempre mudam `isPlaying` para falso, e o tracker usa esse estado para contar tempo.

**Ação:** comunicar estado e fonte efetivamente confirmados pelo motor de reprodução, verificar HTTP antes de confirmar o envio e manter reenvio idempotente. O backend já aceita progresso acumulado por sessão; preservar essa propriedade.

**Aceitação:** erro/buffering não deve contar como música efetivamente tocando; fonte local deve ser registrada corretamente; falhas HTTP no último envio não devem ser confundidas com sucesso.

### 11. Telas ocultas continuam consultando serviços; faltam limites de espera

**Fontes:** [App.tsx](../doomvault/src/App.tsx), componentes mantidos montados com `display:none`; [DownloadsManager.tsx](../doomvault/src/library/DownloadsManager.tsx), linhas 18–35; [services/api.ts](../doomvault/src/services/api.ts).

Preservar telas montadas conserva a navegação, mas mantém efeitos ativos. No cenário baseline da home, observei 28 chamadas à API durante a inicialização/espera do roteiro e quatro consultas de downloads sem abrir essa tela. Esses números incluem o modo de desenvolvimento/StrictMode e não são um benchmark de produção.

O polling continua a cada 1,2 segundo mesmo sem transferências. Diversas chamadas comuns não têm timeout; intervalos podem criar consultas sobrepostas se a resposta demorar. O timeout do updater não protege as outras funções do programa.

**Ação:** separar estado preservado de efeitos ativos, compartilhar consultas, consultar tarefas apenas enquanto necessário e cancelar solicitações ao trocar contexto. Definir limites de espera e recuperação por operação.

**Aceitação:** home ociosa não deve manter polling de downloads sem tarefas; serviço lento deve produzir recuperação, sem acumular solicitações indefinidamente.

### 12. Persistência e importação JSON têm falhas silenciosas/parciais

**Fontes:** [App.tsx](../doomvault/src/App.tsx), linhas 174–196; [DataToolsPage.tsx](../doomvault/src/features/DataToolsPage.tsx), funções `exportBrowser` e `importBrowser`.

Favoritos e coleção mudam em memória e podem exibir sucesso mesmo quando a gravação falha. Esse aviso de persistência não está conectado ao mecanismo já criado para personalização. Na importação JSON, as chaves são gravadas uma a uma; se faltar espaço no meio, as primeiras permanecem alteradas e as seguintes não são aplicadas.

O filtro de importação aceita qualquer chave com os prefixos históricos, sem validar individualmente o formato usado pelos componentes consumidores. Isso amplia os casos em que um backup malformado deixa estado incompatível.

**Ação:** validar previamente os esquemas, manter uma cópia dos valores anteriores e restaurá-los se a operação falhar; informar explicitamente mudanças apenas de sessão. Para maior confiabilidade e futura portabilidade, planejar persistência local nativa com versões de esquema.

**Aceitação:** a interface não deve prometer persistência que falhou; importação deve concluir integralmente ou recuperar o estado anterior.

### 13. WebView sem CSP e script remoto no contexto principal

**Fontes:** [tauri.conf.json](../desktop/src-tauri/tauri.conf.json), linhas 13 e 28; [MusicPlayer.tsx](../doomvault/src/player/MusicPlayer.tsx), `loadYouTubeApi`.

`csp` está nulo e o JavaScript da API do YouTube é carregado como script da página principal, onde também existe a ponte Tauri global. React evita boa parte das inserções HTML diretas e as permissões shell não estão expostas, o que é positivo. Ainda assim, uma falha de injeção ou comprometimento de um script permitido teria maior alcance nesse contexto.

Não reproduzi uma injeção ou execução remota; este é um ponto de endurecimento confirmado na configuração, não uma vulnerabilidade explorada nesta auditoria.

**Ação:** definir uma CSP compatível com Vite/Tauri, imagens, áudio e YouTube, revisar navegação e isolar integrações externas sempre que possível. Testar primeiro para não interromper a reprodução.

**Aceitação:** recursos necessários funcionam com origens declaradas; scripts arbitrários não são aceitos por ausência de política.

### 14. Builds não são reproduzíveis em todas as dependências

**Fontes:** [requirements.txt](../doomvault-api/requirements.txt), [prepare_windows.ps1](../desktop/scripts/prepare_windows.ps1), [desktop/package.json](../desktop/package.json), workflows.

As dependências Python e as ferramentas PyInstaller/Waitress/Pillow são instaladas sem versão fixa. O CLI desktop usa intervalo de versão e `npm install`, sem um lockfile desktop rastreado. Já frontend e Rust têm lockfiles, o que melhora sua previsibilidade. Um build futuro do mesmo commit pode receber ferramentas/dependências diferentes.

As páginas de CI também exibem avisos de depreciação do Node 20 das Actions e mudança de imagem `ubuntu-latest`. Isso não demonstra que foram a causa da falha Windows.

**Ação:** registrar versões/locks das dependências de empacotamento e Python, atualizar Actions após validação e guardar identificação de ferramentas e hash dos artefatos. Reavaliar bibliotecas periodicamente; fixar versões não substitui atualizá-las.

**Aceitação:** deve ser possível identificar e reconstruir o conjunto de dependências de uma Release, sem depender das versões disponíveis no dia.

### 15. Publicação por tag conflita com as regras do ambiente

**Fontes:** [execução da tag](https://github.com/BadZ7br/BZtune/actions/runs/39450308784), [desktop-release.yml](../.github/workflows/desktop-release.yml).

O workflow aceita tags estáveis, mas o ambiente protegido recusou `v2.0.6`: `Tag "v2.0.6" is not allowed to deploy to desktop-release due to environment protection rules`. A execução manual pela `main` funcionou depois.

O bloqueio protegeu o ambiente como configurado. O problema é oferecer um caminho incompatível com a configuração real. Não é necessário enfraquecer a proteção: manter somente o disparo manual em `main` também resolve a incoerência.

**Ação:** escolher um fluxo oficial, alinhar evento e regras do ambiente e documentar aprovação/publicação. Não considerar a tag, isoladamente, prova de instalador pronto.

**Aceitação:** o fluxo documentado deve conseguir chegar ao build autorizado; qualquer aprovação pendente deve aparecer como etapa esperada, não surpresa.

### 16. CSS, textos e documentação acumulam conceitos antigos

**Fontes:** [styles.css](../doomvault/src/styles.css), [README.md](../README.md), [ARQUITETURA.md](ARQUITETURA.md), telas de pesquisa, backup e reprodução.

A folha principal tem **9.665 linhas e 185 ocorrências de `!important`**. Isso não comprova lentidão, mas aumenta o custo de prever efeitos da cascata e de manter temas, densidade e responsividade. Há mensagens como “Confere o Flask”, instruções de terminal no backup e referências a navegador, que transferem detalhes internos para o usuário do desktop.

O README ainda afirma que não há Release estável, separa o desktop em uma branch histórica e apresenta versões de referência diferentes do estado atual. A documentação arquitetural também mantém caminhos e limites da versão web. Isso pode fazer alguém compilar a branch errada ou procurar dados no diretório errado.

**Ação:** atualizar instruções de usuário e de desenvolvedor separadamente; substituir mensagens técnicas por ação compreensível. Modularizar estilos por domínio, preservando tokens globais e validando visualmente cada extração; não remover duplicações em massa.

**Aceitação:** uma pessoa nova deve localizar instalador, desenvolvimento e dados corretos sem inferir qual documento está desatualizado.

## Frontend e experiência de uso

A navegação em cinco áreas e a personalização estão mais consistentes que a infraestrutura de recuperação de erros. Não refaria a aparência inteira nesta fase. O maior ganho imediato vem de manter navegação/player disponíveis quando uma seção falha, informar operações sem persistência e remover instruções de Flask/terminal do fluxo de usuário.

O player concentra resolução de fontes, YouTube, dois elementos de áudio, crossfade, equalizador, letras, histórico e apresentação em um componente de 766 linhas. Extrair resolução de identidade/cache e o motor de reprodução em serviços/hooks testáveis reduziria a chance de as mesmas regras divergirem. A primeira extração deve preservar comportamento e ter testes de alternância online/local.

A revisão atual não mediu contraste em todas as telas nem foi uma avaliação de leitor de tela. Os testes anteriores de personalização e os testes de cores continuam passando, mas isso não autoriza afirmar conformidade integral de acessibilidade. Diálogos/popovers fora da central e navegação mobile merecem uma rodada dedicada de teclado, foco e gestos.

## Caminho para reduzir o servidor local e preparar Android

1. **Estabilizar primeiro os itens 1–7.** O Android reaproveitaria as mesmas falhas de identidade, persistência e backup se elas forem apenas transportadas.
2. **Unificar serviços do frontend.** Há 18 arquivos em `src` com referência direta a `127.0.0.1:5000`. Centralizar transporte/contratos facilita trocar HTTP por IPC sem reescrever cada tela. O adaptador de navegador pode continuar útil ao desenvolvimento.
3. **Migrar biblioteca e arquivos para serviços nativos.** SQLite, metadados, capas, importação e leitura de áudio devem usar caminhos controlados pelo app e contratos compatíveis com os dados existentes. Garantir coordenação entre escritores durante a transição.
4. **Migrar backup/restauração junto do armazenamento.** A restauração precisa conhecer o diretório realmente utilizado e o ciclo de vida do serviço.
5. **Separar provedores de catálogo e downloads.** `ytmusicapi`, `yt-dlp` e FFmpeg são o trecho menos direto de portar. Definir quais funções permanecem, quais ganham provedor próprio e quais exigem implementação por plataforma. Não prometer a mesma solução de executáveis Windows no Android.
6. **Remover o sidecar somente quando não houver consumidores.** Retirar processo, porta, CORS/PNA e rotinas de empacotamento nesse momento, com teste de regressão.
7. **Prova Android pequena.** Importar uma faixa pelo seletor do sistema, criar playlist, reproduzir com tela bloqueada e controlar pela notificação. Validar permissões de armazenamento, serviço de mídia, ciclo de vida e distribuição Android. Tauri, sozinho, não implementa esses comportamentos.

A configuração atual gera NSIS, empacota `.exe`, usa porta fixa e inclui detalhes Windows no launcher. O núcleo de playlists é reutilizável; o produto Android ainda precisa dessa adaptação de plataforma.

## Verificação executada e limites

| Verificação | Resultado | O que sustenta |
| --- | --- | --- |
| JavaScript: `node --test tests/*.test.mjs` | 53 aprovados | Comportamentos cobertos por essas regressões |
| Python: `python -m unittest discover -s tests` | 164 testes: 163 aprovados, 1 ignorado | Funcionalidades/contratos cobertos em Linux; o ignorado exige bloqueio real de arquivos Windows |
| Núcleo Rust: testes de playlists | 8 aprovados | Persistência, concorrência, migração e operações nativas cobertas |
| Rust: Clippy em todos os targets do núcleo, `-D warnings` | Aprovado | Análise estática do núcleo; não do aplicativo Tauri inteiro |
| Verificação Python ↔ Rust em SQLite temporário | Aprovada localmente | Contrato atual no Linux; não elimina a falha Windows do CI |
| Frontend: TypeScript + Vite produção | Aprovado | Compilação; não valida todos os fluxos do usuário |
| `npm audit` do frontend | 0 vulnerabilidades reportadas | Avisos conhecidos da base consultada, não segurança completa nem avaliação das dependências Python/Rust |
| Chromium baseline | Interface montou sem exceção | Cenário controlado com API simulada |
| Chromium com falha de storage | Tela vazia reproduzida | Item 1 |
| Chromium com pesquisa inválida | Tela vazia reproduzida | Item 2 |
| Chromium com prontidão debug sempre falsa | Erro após 45 s, nenhuma consulta HTTP | Item 3, simulação do estado identificado no Rust |
| Snapshot/remoção de áudio em pasta temporária | ZIP aceito com referência sem áudio | Item 5 |
| Resolver real com dois álbuns sintéticos | Solicitou Studio, selecionou Live | Item 6 |
| Blueprint de playlists + CORS do app | Origem externa recebeu 201 e ACAO | Item 8, política de servidor no modo web |
| Tracker com HTTP 500 | Envio considerado concluído sem repetição no encerramento | Item 10 |
| Manifesto público e HEAD do instalador | 2.0.6, HTTP 200 | Publicação e disponibilidade na consulta |

O SQLite gerado pelas sondas era descartável. O log da suíte Python contém uma exceção SQL induzida por teste de recuperação; a suíte terminou aprovada. Isso não foi tratado como falha real de exclusão.

A compilação Tauri completa não foi executada localmente pela ausência de bibliotecas Linux de sistema; a execução de publicação Windows do commit está verde. Não houve teste local de NSIS, WebView2, atualização real, dispositivo Android, áudio real, crossfade audível, leitor de tela ou indisponibilidade real dos provedores externos.

As sondas de frontend usaram o Vite em desenvolvimento. As 28 chamadas observadas não devem ser extrapoladas para memória, CPU ou tempo de inicialização de um instalador de produção. Os sintomas de tela vazia decorrem de exceções de runtime; a ausência de tratamento correspondente também existe no código compilado.

## Ordem recomendada de trabalho

- **Primeiro:** itens 1 e 2, para impedir que erros recuperáveis desmontem o aplicativo.
- **Em seguida:** itens 3–5, para ter desenvolvimento funcional e proteção/restauração real dos dados.
- **Depois:** itens 6 e 7, garantindo a gravação correta e compatibilidade Windows obrigatória antes da publicação.
- **Próxima rodada:** itens 8–15, com transporte, cache, estatísticas, persistência e distribuição coerentes.
- **Manutenção contínua:** item 16 e extração gradual dos serviços para o núcleo nativo.

O produto já entrega funções úteis. Para evoluir com segurança, o foco deve sair da quantidade de recursos e ir para a previsibilidade dos dados, da reprodução e da recuperação quando algo falha.

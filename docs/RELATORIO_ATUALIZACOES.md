**Relatório do sistema de atualizações do BZtune**

Análise do código presente neste ambiente, dos workflows, do manifesto público e do comportamento da interface com ponte Tauri simulada. Nenhum instalador foi executado, nenhuma versão foi publicada e nenhuma configuração funcional foi alterada.

**Situação observada**

O endpoint público `https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json` respondeu HTTP 200 e informou a versão **2.0.4**, plataforma `windows-x86_64`, URL HTTPS do instalador e assinatura no manifesto. Isso confirma disponibilidade do manifesto nesta consulta; não comprova instalação nem validade criptográfica do executável.

A consulta à API de Releases do GitHub foi bloqueada pelo proxy deste ambiente com HTTP 403. Não foram consultados secrets, regras do ambiente de publicação ou o conteúdo do instalador que está no computador do usuário.

A configuração base contém uma chave pública de exemplo e não gera artefatos do updater. Isso é deliberado: `prepare_signing.py` substitui a chave e habilita os artefatos no workflow assinado. Os workflows de preview e do instalador 2.0.5 não seguem essa preparação e não definem a flag que habilita os comandos de atualização assinada. Um arquivo baixado de Actions não constitui, por si só, uma atualização disponível no canal público.

**Como funciona**

1. `desktop-updates.js` só inicia o atualizador quando encontra a ponte Tauri.
2. Após três segundos, lê a preferência de consulta automática. Quando habilitada, procura atualização sem abrir a janela nem instalar nada.
3. O comando Rust consulta o plugin Tauri Updater e guarda a atualização disponível em memória.
4. O usuário clica em “Atualizar agora”. O comando nativo consome a atualização pendente e inicia o download.
5. O plugin verifica a assinatura do pacote antes de instalar. A interface recebe eventos de progresso.
6. No Windows, o callback anterior à instalação encerra o backend desta instância; o instalador NSIS funciona em modo quiet e solicita a reabertura do aplicativo. O código evita um reinício concorrente pelo Rust.

**Pontos positivos**

- Verificação e instalação usam o plugin nativo do Tauri; o navegador comum não oferece instalação.
- A consulta automática respeita a preferência e não instala sem o clique do usuário.
- A assinatura criptográfica do pacote é verificada no cliente. O modo quiet não dispensa essa verificação.
- A configuração normal usa endpoint HTTPS. O HTTP de laboratório é limitado a builds e versões RC específicos.
- O workflow de publicação prepara assinatura, valida o pacote e exige parâmetros explícitos para criar uma Release estável.
- Erros de conexão, manifesto e assinatura recebem mensagens compreensíveis, sem exibir detalhes internos crus.
- A tentativa de instalação consome a atualização pendente; após falhar, a interface exige nova consulta.
- A biblioteca tem um diretório próprio; não há rotina de limpeza dos dados no fluxo de atualização examinado. Isso não substitui testes de migração e restauração.

**Itens recomendados, em ordem de execução**

| Item | Prioridade | Problema | Ação |
| --- | --- | --- | --- |
| 1 | Alta | Versão exibida e versão do pacote podem divergir no build 2.0.5 de teste. | Unificar a origem da versão e validar configuração, Cargo, interface e manifesto no build. |
| 2 | Alta | Consulta e download não têm limite de espera configurado pelo aplicativo. | Definir limites nativos para as duas operações e uma recuperação coerente da interface. |
| 3 | Alta | Falha ao abrir o instalador pode deixar o aplicativo aberto com o backend encerrado. | Recuperar o backend e o estado de disponibilidade quando o lançamento do instalador falhar. |
| 4 | Média | O validador anterior à publicação não verifica criptograficamente a assinatura. | Verificar o executável com a chave pública esperada antes da publicação, mantendo a verificação do cliente. |
| 5 | Média | A interface anuncia preparação da instalação antes de terminar a verificação da assinatura. | Separar download concluído, validação e entrega ao instalador. |
| 6 | Média | A janela de atualização não gerencia o foco de teclado. | Focar a janela ao abrir, controlar Tab, restaurar o foco e fazer Escape funcionar desde a abertura. |
| 7 | Média | Falta comprovação atual de atualização completa pelo canal HTTPS de produção. | Validar duas versões assinadas em Windows, com preservação dos dados e cenários de falha. |
| 8 | Média | O estado de preview, teste local e canal público é pouco explícito para o usuário. | Mostrar canal, versão real e disponibilidade do recurso antes de oferecer a consulta. |

**Evidências e consequências**

1. `desktop-settings-205.yml` altera `tauri.conf.json` para 2.0.5, mas não sincroniza explicitamente `Cargo.toml`, que está em 2.0.0-alpha.2. `desktop_version()` retorna `CARGO_PKG_VERSION`, enquanto o contexto do Tauri usa a versão da configuração para `app.package_info().version`, referência do plugin ao comparar versões. Assim, esse caminho de compilação pode gerar divergência entre o número apresentado na interface e o número usado para atualizar. O workflow assinado, por sua vez, já altera os dois arquivos por `prepare_signing.py`. Convém usar uma única política em todos os builds e confirmar o resultado no artefato Windows.

   Mesmo em um build assinado corretamente, uma instalação 2.0.5 não deve receber a versão pública 2.0.4: o comparador padrão oferece somente versões maiores. Isso é comportamento correto e precisa ser separado de uma falha de consulta.

2. `desktop_check_update()` não configura timeout no builder, e `desktop_install_update()` não define timeout no objeto de atualização. O JavaScript aguarda os comandos com `working=true`, mantendo os botões desabilitados até a promessa terminar. Na versão 2.14.0 do plugin registrada no lockfile, os campos relevantes começam sem timeout e o objeto `Update` é criado com `timeout: None`; é necessário conferir e configurar também o download, não somente o builder da consulta. Uma conexão que não progride pode prender a central sem um caminho de recuperação dentro dela. Esse risco foi identificado no código; não foi simulada uma conexão Windows pendurada até seu limite do sistema.

3. No plugin examinado, `on_before_exit` é chamado antes de `ShellExecuteW`. Se a abertura do instalador falhar, o plugin retorna erro e não encerra o aplicativo. Nesse momento o callback do BZtune já executou `stop_backend()`. Não há recuperação do processo nem atualização correspondente de `BackendReady` nesse caminho. O usuário pode receber uma mensagem de erro e continuar com a biblioteca indisponível até reiniciar o programa. É um caminho de falha confirmado pela ordem do código, não uma falha reproduzida em Windows nesta análise.

4. `validate_release_bundle.py` compara nomes, versão, URL, presença dos arquivos e igualdade entre as assinaturas do JSON e do `.sig`. Não verifica a assinatura contra os bytes do executável e a chave pública. Uma assinatura incorreta mas igual nos dois locais passa nessa validação estrutural. O Tauri bloqueia sua instalação no cliente, porém uma Release inutilizável já poderia ter sido publicada. A validação do formato da chave pública também não demonstra que ela corresponde à chave privada usada para assinar.

5. O evento `bztune-update-finished` vem do callback de fim do download. No plugin 2.14.0, esse callback é executado antes de `self.verify(&buffer)`. O JavaScript mostra “Preparando a instalação silenciosa...” nesse evento. Em seguida, uma assinatura inválida pode ser rejeitada. O bloqueio de segurança continua funcionando; a mensagem de etapa é que se adianta. O teste de interface confirmou a sequência de mensagem e tratamento do erro com eventos simulados.

6. Ao abrir a central com o mouse, o foco permaneceu em `bztune-desktop-open`, fora do painel. Pressionar Escape nessa situação não fechou a janela, pois o handler está no próprio painel. Há `role=dialog` e nome acessível, mas faltam gerenciamento de foco e definição coerente de comportamento modal ou não modal. A central também usa cores próprias e é inserida em `document.body`, fora do escopo de várias regras de personalização; isso permanece relacionado à cobertura visual do projeto.

7. Os testes locais são úteis, mas boa parte verifica código e arquivos sintéticos. Os testes de pacote usam executável e assinatura de demonstração; eles não comprovam instalação. A documentação registra aprovação histórica do fluxo RC3 → RC4 em Windows via loopback. Esse registro não prova que o instalador atual, o canal HTTPS ou uma atualização com as mudanças locais já foram validados. Recomenda-se testar descoberta da versão maior, pacote corrompido, falha de rede, abertura do instalador, encerramento do backend, reabertura e preservação de SQLite, áudio, playlists e preferências. Preservar o diretório da biblioteca não equivale a oferecer rollback automático de futuras migrações de banco.

8. Builds comuns recebem a mensagem de que precisam de uma compilação assinada; não consultam o canal público pelo comando nativo. Builds de laboratório podem ter endereço loopback compilado. Já o workflow assinado aponta para o GitHub. A interface deveria informar esse estado logo ao abrir, evitando que “Buscar atualizações” pareça disponível em uma versão que não pode usá-lo. Este ponto não exige habilitar atualizações em previews sem assinatura.

**Validação executada**

- 39 testes Python relacionados a integração do updater, publicação, chaves públicas, pacote de Release e laboratório RC passaram.
- Os sete testes JavaScript existentes do atualizador passaram.
- No Chromium com comandos Tauri simulados: desativar consulta automática foi respeitado; consulta automática somente notificou; progresso chegou ao percentual esperado; falha de assinatura removeu a oferta de instalação e permitiu nova consulta.
- Também foram reproduzidos o foco permanecer no botão externo e Escape não fechar a janela imediatamente após a abertura.
- O manifesto público foi lido por HTTPS; o executável não foi baixado ou executado e sua assinatura não foi validada nesta análise.
- Nenhuma mudança funcional, publicação ou acesso a credenciais ocorreu.

**Escopo futuro Android**

O fluxo atual é Windows x64, baseado em instalador NSIS. O aplicativo Android precisará de uma estratégia própria de distribuição e atualização, como Play Store ou distribuição de APK com assinatura Android e instalação mediada pelo sistema. O feed de `.exe` e a assinatura Tauri deste fluxo não cobrem esse cenário.

**Fontes principais**

- [Comandos e ciclo de vida nativos](../desktop/src-tauri/src/main.rs).
- [Interface do atualizador](../doomvault/public/desktop-updates.js).
- [Configuração Tauri](../desktop/src-tauri/tauri.conf.json).
- [Workflow de publicação](../.github/workflows/desktop-release.yml).
- [Workflow do instalador de teste 2.0.5](../.github/workflows/desktop-settings-205.yml).
- [Preparação de assinatura e versão](../desktop/scripts/prepare_signing.py).
- [Validador estrutural de Release](../desktop/scripts/validate_release_bundle.py).
- [Documentação do teste e migração para produção](../desktop/PRODUCTION_UPDATE_ROLLOUT.md).

A recomendação é começar pelo item 1 e seguir para limites de espera e recuperação do backend. A arquitetura do updater pode ser mantida; as correções devem concentrar-se na consistência dos builds e nos caminhos de falha.

**Atualização: item 2 implementado localmente**

A consulta agora configura `UpdaterBuilder::timeout` com **30 segundos**. O download configura separadamente `Update::timeout` com **10 minutos**, pois o plugin 2.14.0 não transfere esse valor do builder para o objeto de atualização. Os limites são aplicados pelo cliente HTTP nativo, incluindo a leitura do corpo da resposta. O prazo do pacote é total, não um prazo renovado a cada bloco recebido. No canal atual, há um único endpoint de manifesto; se forem adicionados endpoints alternativos, o limite da consulta será aplicado a cada requisição.

A instalação continua usando `download_and_install`, preservando a verificação de assinatura e os callbacks existentes. O limite HTTP não envolve nem cancela a execução do instalador. Antes de iniciar uma nova consulta, a oferta nativa anterior é descartada; o download continua consumindo a oferta antes de começar. Assim, falhas de consulta não deixam uma atualização anterior pendente para instalação e falhas de download exigem nova busca.

Erros de timeout do Reqwest são convertidos em códigos próprios para consulta e download. A interface traduz esses códigos em mensagens compreensíveis, libera os botões e, no download interrompido, oculta progresso e oferta de instalação. “Buscar atualizações” permite recomeçar. Os códigos técnicos não são exibidos ao usuário. A consulta automática continua sem abrir a central ou iniciar instalação.

Validação executada:

- Dez testes JavaScript do atualizador passaram, incluindo três regressões novas: timeout de consulta, timeout de download seguido de nova busca/instalação simulada e timeout da consulta automática sem abertura da janela. Os testes também verificam bloqueio de consultas concorrentes na interface e liberação dos controles após a rejeição nativa.
- A suíte JavaScript completa passou com **41 testes**. Os **40 testes Python** selecionados de integração, assinatura, workflows, manifesto e laboratório também passaram. Uma regressão estática nova verifica configuração separada dos limites e descarte das ofertas.
- Em Chromium com a ponte Tauri simulada, consulta e download interrompidos exibiram suas mensagens, liberaram nova busca e removeram a instalação pendente. Eventos de progresso recebidos após a falha, enquanto a central estava ociosa, não sobrescreveram a mensagem. A consulta automática permaneceu sem abrir a janela. Não houve exceções JavaScript nesse roteiro.
- Uma sonda Rust independente, temporária, usando **Reqwest 0.13.5**, a mesma versão do plugin no lockfile, passou em três testes HTTP locais: espera sem cabeçalhos, corpo de download parado e corpo com progresso contínuo lento. Para evitar esperar os prazos de produção, os testes usaram limite de 150 ms e confirmaram `is_timeout()`. Essa sonda comprova o comportamento do cliente HTTP, sem executar o plugin Tauri ou instaladores.
- O build de produção do frontend passou. A tentativa de `cargo check --locked --offline` do aplicativo desktop foi bloqueada pela ausência da biblioteca de sistema `glib-2.0` neste ambiente Linux, antes da checagem completa do aplicativo. A compilação nativa e os cenários reais em Windows/WebView2 continuam pendentes.

Nenhuma Release foi publicada, nenhum instalador foi executado e nenhum novo instalador foi gerado. Os demais itens funcionais do relatório permanecem no escopo de suas correções próprias, incluindo a recuperação do backend quando o lançamento do instalador falha (item 3) e a mensagem de etapa anterior à validação da assinatura (item 5).

**Atualização: item 3 implementado localmente**

Cada oferta pendente agora guarda um marcador próprio indicando se o callback anterior à instalação encerrou um backend gerenciado por esta instância. Se o plugin retornar erro depois desse encerramento, o comando inicia a recuperação. Erros de rede, timeout, assinatura ou extração anteriores ao callback preservam o caminho normal de erro, sem reiniciar o serviço. Um servidor externo de desenvolvimento não é encerrado nem adotado como filho gerenciado.

`stop_backend` invalida `BackendReady` e continua encerrando somente o processo/árvore cujo handle pertence ao aplicativo. A criação do sidecar foi separada da política de encerramento fatal da inicialização: a recuperação reutiliza a criação, o token de autenticação e as sondagens HTTP, CORS e PNA, mas não encerra o aplicativo se falhar. O handle do novo processo é armazenado sob bloqueio, sem substituir outro filho já registrado.

A recuperação ocorre em `spawn_blocking`, mantendo as sondagens fora da execução assíncrona do comando. O estado de disponibilidade só volta a verdadeiro depois da validação completa da nova instância. Se o processo novo iniciar, mas não passar nas sondagens, ele é encerrado, o handle é removido e a disponibilidade permanece falsa. A política de sondagem reutiliza o prazo de 45 segundos da inicialização, com os limites de conexão/leitura existentes por requisição; esse prazo é verificado entre sondagens, não constitui um limite absoluto incluindo toda a última sonda.

A interface recebe o evento de restauração e mantém a busca bloqueada até a conclusão. Progresso ou fim de download atrasados não sobrescrevem essa etapa. Se o serviço voltar, a central explica que o instalador não abriu, confirma a restauração e permite uma nova busca. Se a recuperação falhar, informa que a biblioteca está temporariamente indisponível e orienta fechar e abrir o aplicativo. A oferta de instalação consumida não é reutilizada. O caminho de sucesso permanece com a saída/reabertura controladas pelo instalador no Windows, sem reinício concorrente pelo Rust.

Validação:

- **43 testes JavaScript** passaram, incluindo 12 do atualizador. Foram adicionadas regressões para espera durante restauração, rejeição de eventos de progresso nessa etapa, liberação após confirmação de recuperação e mensagem correta quando o backend permanece indisponível.
- **52 testes Python selecionados** passaram, cobrindo ciclo de vida, origens/CORS/PNA, integração do updater, limites de espera, assinatura, workflows, pacote e laboratório. As verificações estáticas anteriores foram ajustadas à separação entre criação, sondagem e recuperação.
- Uma dessas verificações compila os corpos reais de `stop_backend` e `restore_backend` com adaptadores simulados de processo e sondagem. Os **cinco casos Rust** passaram: disponibilidade somente após validação, limpeza do processo substituto após falha de saúde, falha de criação sem anunciar disponibilidade, encerramento apenas do filho próprio e ausência de marcador de encerramento quando não há filho gerenciado. Esse teste não executa o plugin Shell ou um sidecar real.
- Em Chromium com ponte Tauri simulada, a central mostrou a etapa de restauração, preservou o bloqueio, ignorou progresso antigo, diferenciou serviço restaurado de indisponível e permitiu nova consulta após a conclusão. A regressão de timeout e consulta automática sem janela também passou. Não houve exceções JavaScript no roteiro.
- O build de produção do frontend e a análise sintática do arquivo Rust passaram. A compilação completa do aplicativo Tauri permanece sem validação neste ambiente pela ausência de `glib-2.0`, identificada na etapa anterior. A falha real de `ShellExecuteW`, a recuperação do executável Windows e a reprodução de áudio após esse fluxo ainda exigem execução em Windows/WebView2.

Nenhum instalador foi executado ou gerado, nenhuma Release foi publicada e nenhum arquivo da biblioteca foi apagado nesta correção. As mudanças permanecem locais.

**Atualização: item 4 implementado localmente**

O validador anterior à publicação agora exige a chave pública esperada em `BZTUNE_UPDATER_PUBLIC_KEY` e verifica criptograficamente o pacote. O arquivo `.sig` precisa continuar igual à assinatura do manifesto, mas essa igualdade deixou de ser suficiente: os bytes do instalador e o comentário autenticado Minisign são verificados com Ed25519. Um pacote alterado, uma assinatura falsa ou uma assinatura produzida com outra chave são rejeitados, inclusive quando `.sig` e JSON contêm o mesmo texto.

A verificação utiliza a implementação Ed25519 do módulo `node:crypto`, com suporte aos formatos Minisign `ED` (pré-hash BLAKE2b-512) e `Ed` (legado), compatíveis com os formatos aceitos pelo plugin Tauri examinado. No formato atual, o arquivo é lido em blocos para calcular o hash. A chave pública e os campos decodificados da assinatura são enviados ao verificador por stdin; o executável é somente lido. O código não precisa de chave privada nem de dependências npm adicionais.

O CLI também compara a chave pública esperada com a configuração Tauri efetivamente passada pelo workflow. A versão presente no comentário autenticado, quando houver, precisa corresponder ao manifesto; a opção `requireSignedVersion` da configuração, quando ativada, exige esse campo. Assinaturas legadas sem versão autenticada continuam compatíveis quando essa exigência estiver desativada, como na política correspondente do plugin. Dados do comentário só são tratados como autenticados depois de verificar as duas assinaturas.

O workflow `desktop-release.yml` fornece a chave pública esperada e o caminho da configuração preparada. A validação ocorre antes do upload do artefato de teste e antes da publicação de uma Release, tanto no modo de teste quanto no modo estável. Falta de Node, falha do verificador, tempo excedido, chave ausente/incompatível ou assinatura inválida bloqueiam o processo. A verificação de assinatura no cliente Tauri permanece ativa.

Validação:

- Os **20 testes do pacote de Release** passaram usando assinaturas criptográficas válidas sobre conteúdo sintético, que nunca é executado. Foram verificados pacote válido, alteração do executável, assinatura inválida mas igual nos dois arquivos, outra chave com o mesmo ID, comentário autenticado adulterado, versão autenticada divergente, chave do build divergente, chave esperada ausente, formatos atual/legado, exigência de versão assinada e indisponibilidade/timeout do verificador.
- Vetores públicos independentes de `minisign-verify 0.3.0`, biblioteca usada pelo plugin no lockfile, foram aceitos nos formatos atual e legado. Alterar o conteúdo de `test` para `Test` foi rejeitado nos dois casos. Isso complementa as assinaturas geradas pelo helper de testes e verifica compatibilidade de formato sem depender apenas dele.
- O CLI foi executado em subprocesso com configuração e chave pública de teste: aprovou o pacote válido e retornou erro quando a chave esperada estava ausente.
- Passaram **65 testes Python selecionados** de pacote, assinatura, workflow, updater, ciclo de vida e recuperação, além dos **43 testes JavaScript** existentes. As garantias do workflow agora verificam que a validação criptográfica recebe a chave esperada e ocorre antes de ambos os caminhos de distribuição. A sintaxe dos scripts Node e a checagem de espaços do diff passaram.

Não foram acessadas chaves privadas de produção, executados instaladores ou publicadas Releases. O workflow de assinatura/publicação não foi disparado. A validação de um instalador Windows real produzido pelo pipeline permanece para o teste do canal de distribuição; os testes desta etapa usam arquivos e chaves explicitamente sintéticos ou vetores públicos. A documentação de produção foi atualizada. As mudanças permanecem locais.

**Atualização: item 5 implementado localmente**

O comando nativo foi separado em `Update::download` e `Update::install`. Na versão 2.14.0 do plugin examinada, `download` executa seu callback de fim da transferência antes de validar a assinatura e só retorna os bytes com sucesso após a verificação. Por isso, o evento existente `bztune-update-finished` agora mostra “Download concluído. Verificando a assinatura de segurança...”. Ele não anuncia mais preparação da instalação.

Somente no ramo de sucesso de `download`, o Rust emite o novo evento `bztune-update-verified`. A central então informa “Assinatura verificada. Preparando a abertura do instalador...”. Em seguida, `install` valida novamente os mesmos bytes antes de extrair/abrir o instalador. A mensagem de entrega continua vinculada ao sucesso do comando nativo, e não ao percentual de download. No Windows, o plugin normalmente encerra o processo após abrir o instalador; a confirmação final na interface depende de o processo ainda estar em execução.

A interface passou a acompanhar a fase da instalação: download, validação, preparação da instalação e restauração do backend. Eventos de progresso não fazem a mensagem retroceder depois que a transferência termina; eventos de download ou validação não sobrescrevem a restauração. Eventos dessas fases são ignorados quando o comando de instalação não está ativo, inclusive durante uma consulta. A confirmação nativa de assinatura também funciona se a notificação anterior de fim da transferência não tiver chegado.

Os limites HTTP do item 2 continuam aplicados ao objeto `Update`, e o tratamento de erros e recuperação do backend do item 3 foi preservado. Falha na verificação do pacote não chama `install`, não aciona o encerramento do backend e exige nova consulta. A preparação anunciada depois de verificar a assinatura não significa que o instalador já foi aberto: falhas posteriores continuam sendo apresentadas como erro.

Validação:

- **46 testes JavaScript** passaram, incluindo 15 do atualizador. As novas regressões cobrem a sequência download → verificação → preparação → entrega, assinatura rejeitada após concluir a transferência, rejeição de mensagens que retrocedem a fase e confirmação nativa sem a notificação de download anterior.
- **66 testes Python selecionados** passaram. A regressão de integração verifica que o evento de assinatura confirmada e a chamada de instalação estão somente no ramo de sucesso de `download`, na ordem correta. As regressões anteriores de timeout, recuperação, assinatura e workflow permaneceram aprovadas.
- No Chromium com comandos/eventos Tauri simulados, o fim da transferência mostrou somente a verificação, assinatura inválida exibiu erro sem oferecer instalação, confirmação nativa preparou a abertura e a conclusão bem-sucedida do comando mostrou a entrega. O fluxo de recuperação e o bloqueio de eventos que retrocedem a etapa também passaram, sem exceções JavaScript.
- O build de produção do frontend, a sintaxe do JavaScript, a análise sintática do Rust e a checagem de espaços do diff passaram. A compilação completa do aplicativo Tauri e a sequência real de assinatura/instalação no Windows/WebView2 continuam pendentes; este ambiente Linux não possui `glib-2.0`, conforme identificado anteriormente.

Nenhum novo instalador foi gerado ou executado e nenhuma Release foi publicada. As mudanças permanecem locais. O próximo item da sequência é o 6, gerenciamento de foco da central de atualizações.

**Atualização: item 6 implementado localmente**

A central passou a usar um elemento HTML `dialog` aberto por `showModal`, com nome acessível e `aria-modal="true"`. O comportamento é modal: o mecanismo do navegador impede a interação com o conteúdo ao fundo, e a janela utiliza a camada superior nativa. O foco inicial vai para “Fechar”, evitando que abrir a central já posicione o usuário sobre a ação de instalar.

Tab e Shift+Tab percorrem somente os controles visíveis e habilitados, com retorno entre o primeiro e o último. A lista é recalculada a cada tecla para acompanhar a oferta de atualização e a desabilitação durante consulta/instalação. Se o controle focado ficar indisponível, o foco passa para “Fechar”. Ao mover o foco dentro da central, a rolagem interna acompanha o controle, inclusive quando as notas de versão são longas.

Escape usa o evento nativo `cancel`, funcionando desde a abertura, sem depender de o usuário clicar dentro do painel. O botão Fechar e Escape devolvem o foco ao controle anterior; se ele estiver oculto ou removido, a central procura um controle visível de navegação. O fechamento também restaura o valor anterior de rolagem do corpo da página. O gerenciamento de fechamento é idempotente, incluindo o evento nativo `close`.

A consulta automática continua sem abrir a central ou roubar o foco. Fechar a janela durante uma operação não cancela o comando nativo, preservando o comportamento anterior; o término dessa operação enquanto a central estiver fechada não reabre a janela nem desloca o foco. Reabrir durante uma operação foca “Fechar” e respeita os controles desabilitados.

Validação:

- Nove perfis no Chromium: três temas, larguras de 360/960/1360 px, texto Grande, densidade Espaçosa e cantos Bem arredondados. Em 960 px, a altura foi reduzida a 640 px. A janela permaneceu dentro da viewport no roteiro.
- Foram exercitados abertura pelo mouse e por Enter, foco inicial, Tab/Shift+Tab nos dois sentidos, Escape imediato, fechamento pelo botão, controles de consulta e instalação desabilitados, notas extensas e foco visível após rolar até a instalação.
- Tentativas de foco e clique no conteúdo ao fundo não o ativaram enquanto o diálogo estava aberto. O foco foi devolvido à origem ao fechar e à navegação disponível quando a origem estava escondida ou removida. O valor anterior de `body.style.overflow` foi preservado.
- Consulta automática e conclusão de operações com a janela fechada não roubaram o foco nem abriram a janela. Não houve exceções JavaScript no roteiro.
- Os **46 testes JavaScript** e **66 testes Python selecionados** permaneceram aprovados, assim como o build de produção do frontend, a sintaxe do script e a checagem de espaços do diff. O adaptador de DOM dos testes JavaScript foi ajustado para a criação do elemento `dialog`.

A interação foi testada no navegador Chromium com a ponte Tauri simulada. O comportamento em Windows/WebView2 e com leitores de tela reais ainda precisa ser validado na aplicação instalada. Nenhum instalador foi gerado/executado e nenhuma Release foi publicada. As mudanças permanecem locais. O próximo item original é o 7, validação completa do canal HTTPS em Windows.

**Atualização: item 7 preparado, execução real pendente**

O ambiente disponível é Linux, sem sessão Windows, e o responsável informou em 20/10/2026 não ter Windows disponível neste momento. Portanto, o teste completo de atualização HTTPS em Windows não pôde ser executado e este item não está aprovado.

A consulta de leitura ao manifesto público retornou HTTP 200 e anunciou `2.0.4`, plataforma `windows-x86_64`, URL HTTPS de `BZtune-Setup-v2.0.4-x64.exe` e campo de assinatura presente. O instalador não foi baixado, verificado criptograficamente ou executado nesta etapa. Essa evidência confirma somente a disponibilidade do manifesto no momento da consulta.

Foi criado [HTTPS_UPDATE_ACCEPTANCE.md](../desktop/HTTPS_UPDATE_ACCEPTANCE.md), com requisitos de versões base/alvo e identificação dos binários, coleta de backup/JSON antes e depois, medições de áudio, preservação de SQLite/playlists/preferências, sequência de descoberta/assinatura/instalação quiet/reabertura, cenários de falha e registro de aprovação individual. O guia de produção foi corrigido para não afirmar que o canal ainda está sem Release nem induzir o uso automático das antigas versões de exemplo.

A validação das mudanças atuais exige binários que contenham essas mudanças. Um teste entre versões antigas pode comprovar o funcionamento histórico do canal, mas não as correções locais. Um artefato de Actions também não disponibiliza a versão alvo no endpoint `releases/latest`. Cenários de corrupção de pacote/assinatura devem ser isolados em homologação, sem modificar o feed público usado por outras instalações.

Todos os resultados de execução Windows permanecem marcados como **não executados** no roteiro. Nenhum build de distribuição foi disparado, nenhuma Release foi publicada e nenhum instalador foi executado. Nesta etapa foram alterados apenas documentos; a checagem de espaços do diff passou. A conclusão do item depende de um ambiente Windows e de versões assinadas apropriadas disponíveis para o teste.

**Atualização: item 8 implementado localmente**

A central identifica a capacidade do atualizador antes de oferecer consultas. O novo comando nativo `desktop_update_status` retorna versão, canal e disponibilidade a partir da configuração efetiva do aplicativo e da flag de compilação assinada. Diferencia canal público do GitHub, laboratório local, canal HTTPS personalizado, preview e configuração ausente. Não depende de uma preferência do navegador nem deduz o canal apenas pelo número da versão. Não devolve chaves ou endereços ao frontend. Esse estado informa configuração/capacidade, sem comprovar conexão ou assinatura do pacote.

Enquanto a identificação está pendente, a busca fica bloqueada. Em previews, a central explica que esta compilação não recebe atualizações pelo aplicativo; busca manual e automática não chamam o comando de consulta. Configuração sem canal ou chave também não habilita atualização. Os comandos nativos de consulta e instalação verificam a mesma capacidade, mantendo a restrição independente da interface. Nenhum preview passou a receber atualizações por esta mudança.

O laboratório informa que consulta somente o servidor de teste local. O canal público informa que usa GitHub Releases; canais HTTPS diferentes recebem uma identificação própria. A identificação permanece visível durante consulta, download e tratamento de erros. Se o comando de identificação falhar ou retornar estado incoerente, a interface mostra uma mensagem segura e permite repetir somente a identificação, sem consultar ou instalar às cegas.

A versão exibida agora usa `app.package_info().version`, a mesma referência usada pelo plugin ao comparar versões, em vez de `CARGO_PKG_VERSION`. O comando `desktop_version`, também usado pelo rótulo do aplicativo, foi alinhado à mesma origem. Isso corrige a apresentação da versão nesta etapa, mas não substitui a revisão de sincronização e validação de todos os workflows prevista no item 1. Quando não há oferta, a mensagem diz que não existe versão mais nova que a instalada **neste canal**, sem afirmar que um preview é a versão pública mais recente. A consulta automática continua apenas notificando; não abre janela nem instala.

Validação executada:

- **53 testes JavaScript** passaram, incluindo 22 do atualizador. As novas regressões cobrem os cinco estados de canal, bloqueio inicial, ausência de consultas em builds desabilitados, versão retornada pelo nativo, repetição após falha e rejeição de estado incoerente.
- **45 testes Python de desktop** passaram, incluindo verificações estáticas da integração do novo comando com configuração, versão e bloqueios nativos, além das regressões existentes de ciclo de vida, assinatura/workflow e recuperação do backend.
- O build de produção do frontend passou. A análise sintática do Rust com edição 2021 e a checagem de espaços do diff passaram. Isso não equivale à compilação completa do aplicativo nativo, que continua limitada pela ausência de `glib-2.0` neste ambiente.
- No Chromium com ponte Tauri simulada, a navegação modal continuou aprovada em nove combinações de largura/tema, incluindo Tab/Shift+Tab, Escape, restauração do foco, controles ocupados e notificações sem roubar foco. Foram verificados também os cinco estados de canal em tela de 360 px, com busca desabilitada nos estados apropriados e versão visível. Não houve exceções JavaScript nesses roteiros.

As mudanças permanecem locais. Nenhum instalador foi gerado/executado, nenhuma Release foi publicada e o teste Windows do item 7 continua pendente.

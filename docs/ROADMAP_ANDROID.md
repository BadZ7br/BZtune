# Planejamento Android do BZtune

Proposta de 30/10/2026, baseada no código publicado da linha 2.0.12 e na revisão
do repositório neste planejamento. Não representa um APK já desenvolvido/testado.
Público: Brasil. Cobertura inicial aprovada: Android 7 (API 24) até a versão mais recente. Direção: migração gradual com Tauri 2, mantendo o desktop.
Distribuição inicial confirmada: APK de teste pelo GitHub. Aparelhos informados pelo
proprietário: A56 e J5 (tratados como candidatos Samsung Galaxy; confirmar variantes
e versões do Android, especialmente o J5). Canal público final ainda será decidido. Sem alteração de produção nesta etapa.

## Objetivo e arquitetura

Preservar as funções do BZtune ao longo da migração. As primeiras versões Android
serão parciais e deverão identificar os recursos disponíveis. Paridade funcional
será demonstrada por testes, não pela presença dos mesmos botões.

- React/TypeScript: interface compartilhada, com composição e navegação adaptadas ao celular.
- Rust: regras e persistência portáveis; ampliar o núcleo já existente em desktop/native-core.
- Kotlin com AndroidX Media3: reprodução, sessão de mídia, foco de áudio, serviço em
  primeiro plano quando necessário, notificação, tela bloqueada e comandos de fones.
- Adaptadores por plataforma: biblioteca, arquivos, áudio, catálogo, downloads,
  preferências, diagnóstico e atualização. Desktop continua com os serviços atuais
  enquanto cada substituição é validada. Android não deve depender de Flask/localhost.

Tauri mantém uma interface em WebView. A proposta resolve a dependência do servidor
Python no Android e usa serviços nativos para áudio; não transforma a apresentação
React em componentes Android nativos.

A fila pertence ao serviço de reprodução Android. A interface recebe snapshots e
eventos com revisão, em vez de manter uma segunda fila independente. Reabrir a
interface deve recuperar o estado do serviço. Após encerramento completo do processo,
restaurar fila/posição sem iniciar áudio inesperadamente.

## Situação observada e destino

| Área | Hoje | Destino Android / aceite |
| --- | --- | --- |
| Inicialização | main.tsx aguarda desktop_backend_ready e API HTTP | Entrada mobile sem sidecar; abrir interface e biblioteca offline |
| Pesquisa, artistas, álbuns, gêneros, descoberta e recomendações | Frontend e backend Python | Contrato de catálogo; validar busca e gravação específica sem depender do desktop |
| Áudio online | IFrame do YouTube | Prova independente de fonte suportada; catálogo não comprova reprodução |
| Áudio local e fila | HTML audio e estado React | Media3; fila, shuffle, repetição, seek e retomada no serviço |
| Biblioteca | SQLite, caminhos de disco e endpoints locais | IDs estáveis; MediaStore/SAF e URIs content://; permissão persistente quando aplicável |
| Playlists | Há núcleo SQLite Rust | Adaptar referências e caminhos; testar bridge, migração e transações no Android |
| Favoritos e coleção | Estado/configurações da interface | Preservar identidade de edições e nomes Unicode; importação portátil |
| Letras e LRC | LRCLIB, cache e importação | Transporte compatível e relógio do player nativo; análise detalhada separada |
| Downloads | yt-dlp, FFmpeg e backend | Fila persistente Android e fonte comprovada; retomar após rede/interrupções |
| Equalizador e crossfade | Web Audio | Implementação/prova no mecanismo nativo; respeitar limites de formatos/dispositivos |
| Histórico e estatísticas | Progresso da interface e banco Python | Eventos do serviço, sem depender da tela aberta e sem contar pausas |
| Aparência e acessibilidade | React/CSS e preferências | Toque, TalkBack, fontes ampliadas, tema, orientação e barras do sistema |
| Backup e restauração | ZIP/JSON e referências desktop | Esquema versionado; exportação por seletor Android, sem caminhos absolutos Windows |
| Diagnóstico | Python/FFmpeg/updater desktop | Capacidades Android: mídia, permissões, armazenamento e rede; resultados sem dados pessoais |
| Atualização | NSIS e updater Tauri desktop | APK/loja, pacote e chave Android próprios; sem instalação silenciosa |

## Entregas, em ordem

### 0 — Contratos e proteção do desktop

Inventariar os comandos/casos de uso de cada linha da tabela. Centralizar acesso aos
serviços gradualmente, sem uma troca geral de todos os endpoints. Primeiro extrair
contratos de biblioteca e playlists, com adaptadores desktop que preservem o comportamento.
Definir versão de esquema, IDs e capacidades por plataforma. Uma faixa deve referenciar
seu ID/origem/URI, não uma URL localhost como identidade permanente.

Aceite: regressão desktop aprovada; dados e backups continuam compatíveis. Nenhuma
função existente substituída por um mock no produto.

### 1 — Estrutura mobile e prova de áudio local

Preparar entrada mobile do Tauri, configuração Android separada, SDK/NDK/JDK e bridge
Kotlin. Excluir inicialização do sidecar, updater Windows e executáveis .exe do build
mobile por configuração/compilação condicional. Implementar uma faixa escolhida pelo
seletor Android e serviço Media3 com estado e eventos.

Aceite em aparelho real: tocar/pausar/seek; notificação e tela bloqueada; tela apagada;
mandar o app para segundo plano; perder foco para outro áudio/chamada; desconectar fone;
reabrir interface sem duplicar player. Distinguir remover a tarefa, morte do processo e
forçar parada: não prometer continuidade após forçar parada pelo usuário.

### 2 — Fila, biblioteca e dados offline

Fila persistente, shuffle/repetição, playlists, favoritos e coleção. Adaptar núcleo
Rust/SQLite e arquivos content://; testar permissões revogadas e arquivo removido.
Definir como importar dados do desktop sem exigir o backup completo de músicas.

Aceite: modo avião; fechar/reabrir; migração de esquema; playlist com faixas locais;
Unicode e edições distintas preservados. Arquivos do usuário nunca apagados como limpeza de cache.

### 3 — Prova online e interface mobile

Em paralelo após a prova local, implementar um fluxo completo de catálogo → seleção
→ resolução de fonte → reprodução. O mecanismo desktop do YouTube é o maior risco:
não assumir que o IFrame fornece mídia utilizável no ExoPlayer. Confirmar fonte,
comportamento e requisitos de distribuição antes de ampliar o catálogo.

Adaptar telas: Início, Busca e Biblioteca como navegação principal candidata; playlists,
favoritos, coleção, descoberta e estatísticas acessíveis sem reproduzir uma barra desktop
em largura reduzida. Miniplayer persistente; player completo com fila e ferramentas em
telas/painéis adequados ao toque. Revisar proposta visual antes de implementar o conjunto.

Aceite: uma música online completa; erros de rede recuperáveis; voltar do sistema e
teclado corretos; 360 dp e fontes ampliadas; nenhum controle coberto por barras do Android.
Sem fonte online comprovada, continuar o offline e registrar a limitação, sem prometer paridade.

### 4 — Downloads, letras e recursos avançados

Migrar downloads somente após validar a fonte online. Escolher mecanismo conforme a tarefa:
WorkManager para trabalho adiável não substitui automaticamente reprodução ou todo download.
Validar armazenamento cheio, interrupção, retomada, integridade e proteção contra duplicatas.
Não embarcar os executáveis Windows; avaliar conversão e licenças se FFmpeg Android for necessário.

Conectar letras/cache/importação ao relógio nativo; tratar seek, pausa, troca de faixa e
metadados tardios. A análise de letras do desktop permanece um trabalho separado.
Adicionar equalizador, crossfade, histórico e estatísticas baseados no serviço. Adaptar
personalização, backup e diagnóstico e fechar a matriz de paridade da tabela.

Aceite por recurso: funcionar com tela aberta e em segundo plano quando aplicável;
reabrir sem perder dados; falha em um serviço não inutilizar a biblioteca local.

### 5 — Testes de distribuição e publicação

Definir identificador Android definitivo antes do primeiro APK distribuído. Criar e
proteger chave de assinatura; mesma identidade nas próximas versões. Chave de updater
desktop não assina APK. APK de teste deve ter identidade/canal que evite conflito com
uma futura instalação de produção. AAB se o canal escolhido for Google Play.

CI separado: testes Rust/contratos, testes Android, emulador, build e assinatura;
APK assinado para teste interno antes de distribuição pública. Sem compartilhar segredo
no frontend ou no repositório. Garantir atualização sobre versão anterior preservando dados.
Revalidar regras vigentes de SDK, serviços, permissões e publicação no canal escolhido.

## Compatibilidade e testes

Piso inicial aprovado: **Android 7/API 24**, até a versão estável mais recente.
Android 6 não faz parte do mínimo desta primeira implementação. O protótipo já
compila com minSdk 24; o aceite de execução permanece dependente dos aparelhos.
minSdk é diferente de compileSdk/targetSdk: compilar com SDK 37 não exige Android 17
no telefone. Revalidar os requisitos de distribuição ao publicar versão estável.

Arquiteturas iniciais: arm64-v8a e armeabi-v7a, em APK universal de teste. A56 é o
aparelho principal; confirmar modelo, Android, ABI e WebView do J5 antes do aceite.
Android 7 requer WebView compatível e atualizado. Validar páginas de memória de
16 KB nas bibliotecas nativas ao preparar distribuição recente.

Matriz: API 24 para mínimo; Android 10–12 para armazenamento; 13–14 para permissões;
15–16 e versão estável mais recente na implementação para comportamento atual.
Essas escolhas cobrem comportamentos; não representam ranking de mercado medido.

Automatizar contratos, migrações, fila, respostas inválidas, offline e atualização.
Em aparelho real: Bluetooth/fones, chamadas/foco, tela apagada, bateria, armazenamento e
reabertura. Emulador sozinho não aprova esses cenários. Medir memória/travamentos/bateria;
estabelecer orçamento após a prova, sem inventar metas antes de medir.

## OpenTune e decisões pendentes

OpenTune continua como referência desejada de experiência. O levantamento anterior em
PLANO_ANDROID_BRASIL.md não conseguiu verificar a ficha/código exatos. Identificar link
acessível e versão antes de comparar arquitetura, licença ou copiar implementação.
A direção Media3 é recomendação para BZtune, não uma afirmação sobre o código do OpenTune.

Canal inicial confirmado: GitHub APK. Testar o A56 como aparelho principal e o J5
como candidato antigo. Confirmar código SM-J…, Android, ABI e WebView. Não prometer
compatibilidade pelo nome J5, nem deduzir ABI apenas pela capacidade do processador.

Decidir estratégia de fonte online após a
prova técnica, e validar o piso Android 7 aprovado na matriz de compatibilidade.
Não há prazo fechado: áudio local e fonte online são marcos que permitem estimar o restante.

Primeiro trabalho de implementação recomendado: entrega 0 e esqueleto mobile da entrega 1,
em mudanças pequenas, sem modificar o mecanismo de reprodução desktop nessa primeira etapa.


## Início da implementação — Android 7

O proprietário aprovou iniciar em Android 7/API 24. A investigação de Android 6 deixa
de bloquear a primeira entrega; referências anteriores à API 23 neste documento
registram o objetivo discutido anteriormente, não o mínimo deste protótipo.
Estrutura e instruções da primeira etapa em `mobile/README.md`. A prova de áudio
usa uma entrada mobile separada e um plugin Kotlin Media3, sem reescrever o player
desktop nesta etapa. Paridade funcional e aceite em hardware ainda são marcos futuros.

## Progresso da implementação — 0.3.0

Fila nativa e persistência estão na 0.2.0. A 0.3.0 acrescenta catálogo local SQLite,
importação manual por SAF, tags/capas embutidas, busca e filtros paginados, reprodução
a partir do catálogo e remoção somente do registro. Não há scanner MediaStore/pastas,
playlists, favoritos/coleção, backup Android ou assinatura estável de distribuição ainda.
O APK universal mantém minSdk 24. Testes SQLite executados com API 24 simulada, além
de controles/contratos da interface; áudio, permissões, tags/capas e bateria continuam
aguardando aceite nos aparelhos. Detalhes e limites em mobile/README.md.

## Plano incremental atualizado — 31/10/2026

O proprietário pediu evolução passo a passo até a paridade com o desktop e indicou
[Arturo254/OpenTune-Web](https://github.com/Arturo254/OpenTune-Web) como referência.
A base local 0.4.0 já tem fila, biblioteca, backup e assinatura fixa. Importação e
reprodução com tela apagada na 0.3.0 foram confirmadas pelo proprietário no A56;
backup completo e outros cenários físicos continuam pendentes de aceite.

### Referência OpenTune verificada

Consultados README, página `pt_BR.html`, LICENSE e três capturas do site no commit
[`22855548db899bc1aef4c9e5b8127720e6089ec7`](https://github.com/Arturo254/OpenTune-Web/tree/22855548db899bc1aef4c9e5b8127720e6089ec7).
Esse repositório é o site de apresentação do aplicativo. A tentativa de acessar o
repositório Android `Arturo254/OpenTune` retornou HTTP 451, e o domínio F-Droid foi
bloqueado pela rede deste ambiente. Não foi possível verificar código Android,
minSdk, dependências ou distribuição pelo F-Droid.

Observações visuais nas capturas, sem executar o aplicativo de referência:

- `img/biblioteca.webp`: categorias de músicas/álbuns/playlists, atalhos para favoritas
  e downloads, listas de playlists e navegação inferior.
- `img/reproductor.webp`: arte em destaque, título/artista, coração, menu de opções,
  progresso, controles centrais e atalhos de fila/letras/saída de áudio.
- `img/ajustes.webp`: ajustes agrupados por aparência, reprodução/áudio, armazenamento
  e privacidade. Essa captura exibe versão 3.0.1; não comprova a versão atual do app.

O texto do site anuncia recursos online, playlists, downloads e conta YouTube Music;
essas descrições não comprovam funcionamento ou disponibilidade das APIs para o BZtune.
A página diz Android 8+ para o OpenTune; isso não altera o mínimo Android 7 do BZtune.
A implementação BZtune continua própria, em Tauri/React e Media3; nenhum código ou
imagem do projeto de referência foi incorporado ao aplicativo.

### Sequência de entregas pequenas

Cada linha deve ter persistência, erros recuperáveis e testes próprios antes de ser
marcada como implementada. Aceite em hardware é registrado separadamente.

| Ordem | Entrega | Critério principal |
| --- | --- | --- |
| 1 | Favoritas locais | Marcar/desmarcar, filtrar, reabrir, reimportar e exportar/restaurar sem perder a escolha; sem alterar fila ou áudio |
| 2 | Playlists locais | Criar/renomear/excluir; adicionar/remover/reordenar faixas; tocar/adicionar à fila; incluir no backup |
| 3 | Álbuns, artistas e coleção | Telas de detalhes; favoritas de álbuns e coleção com identidade de edição; manter músicas favoritas como recurso separado |
| 4 | Navegação e player completo | Início/Busca/Biblioteca, miniplayer persistente, tela do player com capa e poucos controles; fila e ferramentas em painéis próprios; Voltar/TalkBack |
| 5 | Biblioteca avançada | Ordenação, pastas/MediaStore conforme permissão, fontes indisponíveis, duplicatas e reimportação; nunca apagar originais por limpeza |
| 6 | Histórico e estatísticas | Registrar no serviço, inclusive com tela apagada; pausas não contam como escuta |
| 7 | Letras | LRCLIB, cache, importação LRC, versões, ajuste temporal e acompanhamento ligados ao relógio Media3 |
| 8 | Busca e reprodução online | Primeiro provar fonte completa; depois artistas/álbuns/gêneros, descoberta e recomendações; tratar rede sem bloquear offline |
| 9 | Downloads | Após a fonte online; fila persistente, progresso, cancelamento/retomada, integridade e espaço insuficiente |
| 10 | Áudio avançado | Equalizador e crossfade no mecanismo nativo; validar formatos, foco, Bluetooth e bateria |
| 11 | Personalização e ferramentas | Temas, cores, fontes, preferências, diagnóstico/issue, manutenção e intercâmbio de dados desktop/Android |
| 12 | Distribuição e paridade | Atualizar sobre APK anterior preservando dados; matriz Android 7→atual, ABI/WebView, acessibilidade e inventário de funções desktop concluído |

Favoritos do desktop hoje identificam **álbuns** (`App.tsx` e `PlayerAlbumActions.tsx`).
A primeira entrega Android adiciona favoritas de **faixas locais**, inspirada no atalho
da biblioteca OpenTune. Não equivale à migração completa de favoritos/coleção desktop:
as identidades e ações de álbuns serão tratadas na entrega 3. Não unificar edições pelo título.

### Primeira entrega — 0.5.0

Favoritas de faixas salvas no SQLite, combinadas com busca/filtros/paginação. Reimportar
atualiza metadados e preserva a escolha; remover o registro remove sua marcação, sem
apagar áudio nem alterar a fila. Migração SQLite 1/2→3 preserva catálogo e recuperação pendente.
Backup formato 2 inclui a marcação; formato 1 da 0.4.0 continua legível e restaura sem
favoritas, com aviso na confirmação. Novos backups não são legíveis pela versão antiga.
Playlists e as etapas posteriores não estão incluídas nesta entrega.

### Segunda entrega — playlists locais 0.6.0

Implementados criar/renomear/excluir, adicionar da biblioteca, remover/reordenar faixas,
reprodução e envio à fila. IDs de faixas são referências ao catálogo, sem cópia de áudio.
Revisões rejeitam comandos de telas desatualizadas. Limites explícitos de 100 playlists
com até 200 faixas; duplicatas por ID não são adicionadas. Banco Android versão 4;
backup formato 3 inclui a ordem, mantendo leitura dos formatos 1/2. Testes locais:
42 Kotlin, quatro suítes de navegador, APK ARM 32/64 e build desktop aprovados.
Aceite de áudio/arquivos e backup no A56 permanece separado e pendente.

### Terceira entrega — catálogo de álbuns e coleção local 0.7.0

Implementados catálogo de álbuns paginado, busca por título/artista/ano, favoritos de
álbuns e coleção independentes das favoritas de faixas. Identidade preserva artista
do álbum/título/ano e Unicode. Marcas sobrevivem à remoção das músicas locais, com
contagem zero e sem prometer que esses arquivos ainda estão disponíveis. Limite de
2.000 álbuns marcados, com erro explícito ao exceder. Alterações de tela antiga não
sobrescrevem escolhas recentes.

Ver músicas/artista aplica filtros à biblioteca existente; não inicia reprodução.
Para compilações, o filtro inclui artista da faixa e do álbum. Biografia/discografia
online e intercâmbio de coleção desktop ainda pertencem às etapas futuras.
SQLite versão 5 e backup formato 4 incluem a coleção, preservando leitura dos formatos
1/2/3. O APK 0.7.0 reúne esta etapa com as playlists 0.6.0, em commits separados.

Validação local acumulada: 50 testes Kotlin, cinco suítes de navegador, APK ARM 32/64,
Android mínimo 7, build desktop e estrutura aprovados. Aceite físico no A56 continua
pendente. Próxima entrega de implementação: navegação principal, miniplayer e player
completo, usando as capturas OpenTune citadas acima como referência de organização.

### Próxima entrega — navegação e player (especificação, ainda não implementada)

Usar a organização observada nas capturas OpenTune, preservando a identidade BZtune:

- Navegação inferior: Início, Busca, Biblioteca e Ajustes. Busca inicialmente local,
  identificada como tal, até a prova de fonte online. Biblioteca reúne Músicas/Álbuns/
  Playlists; favoritas e coleção são filtros das categorias correspondentes.
- Início com atalhos funcionais para essas categorias. Não inventar histórico, faixas
  recentes, contagens ou recomendações antes de haver dados reais para esses recursos.
- Miniplayer persistente com título, artista, tocar/pausar e acesso ao player completo.
  Uma única sessão Media3 continua sendo a autoridade da fila; navegar não recria áudio.
- Player completo: capa, metadados, progresso, anterior/tocar/próxima, shuffle e repetição.
  A fila abre como painel próprio. Edição de playlists, coleção, backup e ajustes saem
  da tela principal de reprodução, mas continuam acessíveis pela navegação.
- Capas devem usar o thumbnail privado já importado. Obter detalhes pela referência da
  faixa atual fora da thread de interface nativa e rejeitar resposta para outra faixa.
  Não reenviar imagens a cada snapshot de progresso; usar placeholder sem capa disponível.
- Ajustes agrupam backup, informações e preferências realmente implementadas. Não exibir
  controles de recursos ainda inexistentes como se estivessem ativos.
- Preservar filtro/edição em andamento ao navegar quando seguro. Durante uma operação
  nativa que altera dados, manter a exclusão mútua já existente entre biblioteca,
  playlists, coleção e restauração. Fechar uma tela não deve simular cancelamento de SQL.
- Abrir o player deve mover e conter o foco; fechar devolve ao botão de origem. Testar
  Voltar do Android, Escape/teclado, TalkBack, fonte ampliada e barras do sistema.
- Listas paginadas continuam mostrando 50 itens. Evitar montar todas as listas ocultas
  e duplicar componentes do player. Não armazenar uma segunda fila em localStorage.

Aceite: as cinco suítes atuais continuam verificando os mesmos fluxos através da nova
navegação, mais testes de abertura/fechamento/foco, miniplayer, estado após alternar telas
e resposta de capa atrasada. Validar no A56 e no piso Android 7/WebView compatível.
Essa especificação não é um relatório de uma interface ou comportamento já implementado.

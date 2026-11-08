# BZtune Android — biblioteca e reprodução local

Mínimo configurado: **Android 7 / API 24**. Aplicativo de teste independente:
`com.bztune.android.preview`, versão de teste 0.9.0. Não substitui o desktop.
O frontend compartilha o projeto React/TypeScript, mas tem entrada mobile própria,
sem Flask, localhost:5000, executáveis Windows ou updater desktop.

## O que existe

- Seleção de vários áudios via Storage Access Framework (`ACTION_OPEN_DOCUMENT`).
- URI `content://` e permissão persistente, sem acesso geral ao armazenamento.
- Biblioteca SQLite com importação explícita, título/artista/álbum/ano, capas embutidas,
  busca offline, filtros por artista/álbum e páginas de 50 músicas.
- Fila nativa com adicionar, remover, reordenar, selecionar, anterior/próxima, shuffle e repetição.
- Player Media3 em `MediaSessionService`: tocar/pausar, seek e pausa ao desconectar fone.
- Sessão para controles do Android, foco de áudio e notificação de reprodução.
- Recuperação da fila, faixa, posição e modos, sempre pausada. A posição é registrada
  em eventos do player e a cada cinco segundos durante a reprodução; encerramento
  abrupto pode perder os últimos segundos. A ordem aleatória pode ser recalculada na retomada.
- Interface inicial em português; seletor cancelável, erro recuperável e controles de toque.

A exploração de metadados online usa MusicBrainz. Reprodução online, downloads, letras,
equalizador e demais funções do desktop ainda não foram migrados. Este APK prova a fundação mobile. A fila de teste aceita até 200 entradas e rejeita
seleções maiores, sem truncar músicas. Remover da fila não apaga o arquivo.
O proprietário confirmou importação e reprodução com tela apagada na 0.3.0 no A56.
Fones/Bluetooth, chamadas, formatos adicionais e execução em Android 7 ainda precisam
de validação real. Compilação e teste de interface não comprovam esses comportamentos.
Android 7 exige WebView compatível e atualizado; a versão do sistema sozinha não garante isso.
Não há reprodução garantida após forçar parada pelo usuário.

## Compilar

Pré-requisitos: Node 22, Rust e targets Android, **JDK completo 21** (não apenas JRE),
Android SDK/NDK e ferramentas listadas no workflow `.github/workflows/android-test.yml`.
O projeto Gradle já está versionado; não é necessário executar `android init` novamente.

```sh
npm ci --prefix doomvault
npm ci --prefix mobile
rustup target add aarch64-linux-android armv7-linux-androideabi
# Configurar JAVA_HOME, ANDROID_HOME e NDK_HOME para suas instalações.
npm --prefix mobile run tauri -- android build --debug --apk --target aarch64 armv7 --ci
```

Os APKs ficam em `mobile/src-tauri/gen/android/app/build/outputs/apk/`.
O workflow **Android - APK de teste** executa o teste da interface e disponibiliza o
artefato **BZtune-Android-7-teste-assinatura-estavel** quando a chave fixa está
configurada, ou **BZtune-Android-7-debug-descartavel** quando não há configuração.
Não publica uma atualização Windows nem uma versão estável Android.

O APK de teste remove símbolos nativos de depuração para reduzir o tamanho, mas
continua sendo um build de desenvolvimento. A identidade fixa de teste já está configurada no GitHub e foi conferida no primeiro APK.
Builds locais sem secrets usam certificado debug descartável. Eles podem exigir reinstalação
e não substituem a identidade fixa do CI.
Não guardar keystore/senhas no repositório. Arquivos originais escolhidos pelo usuário
não são copiados, modificados ou apagados pelo player.

## Teste da interface

```sh
npm --prefix doomvault run build:android
# Em outro terminal, a partir de doomvault:
node node_modules/vite/bin/vite.js preview --config vite.mobile.config.ts --port 1420 --strictPort
# Com Playwright instalado no doomvault:
node tests/mobile/android-player.cjs
```

O teste de navegador simula a ponte nativa explicitamente. Verifica controles, cancelamento,
resposta inválida, telas pequenas e ausência de chamadas ao backend desktop.

## Aceite no A56 e em Android 7

1. Instalar o APK correspondente à arquitetura (universal ARM quando disponível).
2. Abrir, escolher um áudio local, cancelar e repetir; tocar, pausar e avançar.
3. Apagar a tela, aguardar alguns minutos e controlar pela tela bloqueada/notificação.
4. Alternar para outro aplicativo e verificar continuidade/controles.
5. Iniciar outro áudio/chamada; testar foco de áudio e desconexão de fone/Bluetooth.
6. Fechar/reabrir a interface; encerrar/reabrir o processo e verificar restauração pausada.
7. Remover/revogar acesso ao arquivo e verificar mensagem recuperável.
8. Repetir em Android 7/API 24 com WebView compatível e em Android recente.

Registrar modelo, Android, WebView, arquitetura, formato do áudio e resultado. Não incluir
arquivos pessoais no issue. O nome J5 sozinho não identifica versão nem ABI compatível.

## Validação histórica da primeira implementação (0.1.0)

Build local completo aprovado (Rust aarch64/armv7 + Kotlin/Java + APK). Conferência do
pacote: minSdk 24, targetSdk 37, duas ABIs ARM, assinatura debug válida, 31,4 MiB.
SHA-256 do APK local desta validação:
`4cfc944bed2a5c417c86fbbde44b591e2420ed111414323944e193cb6a52b913`.
O APK do GitHub pode ter hash diferente por usar outro certificado debug/ambiente.

Teste de interface aprovado em 320 e 412 px, incluindo cancelamento e resposta inválida.
Regressão desktop: 230 testes Python aprovados (um exclusivo de Windows ignorado),
125 testes JavaScript e build desktop aprovados. Verificação de estrutura aprovada.
Áudio real, notificação, tela apagada, bateria e fones **ainda aguardam teste no aparelho**.


## Segunda etapa — fila local (0.2.0)

A fila pertence ao serviço Media3; não é mantida uma cópia independente em localStorage.
Seleção múltipla consulta metadados fora da thread de interface. Comandos de remover,
selecionar e reordenar verificam ID e posição para rejeitar ações de uma tela desatualizada.
Adicionar mantém a faixa atual; substituir a seleção monta uma fila nova sem iniciar áudio.
Cache JSON versionado inclui IDs, referências content://, índice, posição e modos.
Referências HTTP, IDs duplicados, índice inválido ou cache acima do limite são rejeitados.
Cache inválido não é substituído automaticamente por uma fila vazia. Selecionar novos
arquivos permite iniciar uma fila válida. Há migração da última faixa salva pela 0.1.0.

A restauração não armazena um comando de tocar: reabrir após recriar o serviço mantém
pausa. Reabrir só a interface acompanha o serviço em andamento, sem criar outro player.
A validação em hardware permanece pendente; testes de codecs/contratos não comprovam áudio.

Validação local da 0.2.0: APK universal compilado (Rust e Kotlin), minSdk 24,
assinatura debug verificada, 31,6 MiB. SHA-256:
`db1a79c4c906f3e77cf4750d5301788f0817dadc58fb6e8c2ece72c09604a1d3`.
Sete testes JVM Kotlin do codec de persistência aprovados; interface em 320/412 px
aprovada para seleção múltipla simulada, navegação, edição da fila, modos, cancelamento
e preservação do último estado válido em resposta malformada. Build desktop e
verificação de estrutura aprovados. Sem aceite físico de áudio nesta etapa.


## Terceira etapa — biblioteca local (0.3.0)

Importe os arquivos pelo botão **Importar músicas**. O catálogo fica em SQLite no
armazenamento privado Android, separado da fila. A importação não toca nem altera
áudio: guarda referências aos arquivos e seus metadados. Reimportar a mesma URI
atualiza o registro; arquivos diferentes com o mesmo título continuam separados.
Não há varredura geral do aparelho, importação de pastas ou integração MediaStore nesta etapa.

A busca ignora acentos e preserva nomes não latinos. Filtros de álbuns usam artista
do álbum, título e ano; isso não identifica edições cujas tags sejam indistinguíveis.
Metadados ausentes usam o nome do arquivo e rótulos de desconhecido. A leitura de
capas embutidas produz thumbnails JPEG privados; não consulta provedores externos.
Arquivos sem capa exibem um placeholder. Fotos/capas originais não são modificadas.

**Tocar agora** substitui a fila por essa faixa e inicia reprodução por ação explícita.
**Adicionar à fila** preserva a faixa atual e respeita o limite de 200 entradas do protótipo.
**Remover registro** remove apenas a entrada e thumbnail privado, preservando áudio e fila.
Arquivo movido/removido ou permissão revogada exigem nova seleção pelo Android.

O catálogo é paginado, sem truncamento global em 50 entradas. Importação usa lotes de
até 200 arquivos e prazo de 30 segundos para leitura de metadados. Em falha/prazo, o
lote não é adicionado ao banco; um provedor que demore pode exigir lotes menores.
Os limites de permissões persistentes do próprio aparelho/provedor também se aplicam.
Os arquivos não são copiados: selecionar uma origem em nuvem não garante áudio offline.
Acesso aos arquivos, extração real de tags/capas, formatos e consumo de recursos ainda
precisam de aceite nos aparelhos. Chaves debug e limitações de atualização de testes
continuam iguais às descritas acima; o backup foi introduzido na 0.4.0, descrita abaixo.

Os testes SQLite com Robolectric em API 24 detectaram e corrigiram a incompatibilidade
de AutoCloseable do SQLiteOpenHelper antigo: o helper do app implementa Closeable
explicitamente. Testes verificam reabertura, atualização por URI, nomes iguais em
arquivos distintos, paginação, Unicode, escapes de busca, filtros e remoção sem apagar áudio.
Testes de navegador usam ponte simulada e verificam respostas fora de ordem, contratos,
importação, filtros, interação com fila e erros recuperáveis; não comprovam áudio real.

Validação local da 0.3.0: APK universal compilado, assinatura debug verificada,
minSdk 24, ARM de 32/64 bits e 31.6 MiB. SHA-256: `779b3cc1b542983e8445a0199c744183a655a067e996cde57dc18b1bbaee6f8e`.
Dezesseis testes Kotlin aprovados (8 fila/cache legado, 3 regras, 5 SQLite em API 24
simulado), duas suítes de interface mobile aprovadas, build desktop e estrutura aprovados.
Artista/álbum das faixas da biblioteca também são preservados no cache da fila, mantendo
leitura do cache legado. Leitura real de tags/capas e áudio no A56/J5 aguardam aceite físico.


## Chave de assinatura estável

Configuração e transição dos APKs debug em [ANDROID_ASSINATURA.md](../docs/ANDROID_ASSINATURA.md).
O workflow diferencia assinatura estável de debug descartável; ativação requer dois
secrets e o SHA-256 público no GitHub. A identidade fixa do proprietário já foi cadastrada e validada no CI.

A configuração da identidade fixa pelo proprietário concluiu no workflow
`41155109498`. O primeiro APK com essa identidade passou no workflow `41155276446`,
com comparação do certificado antes do upload do artefato.

## Quarta etapa — backup de dados (0.4.0)

Na seção **Backup dos dados**, use **Exportar backup** e escolha o destino no Android.
O JSON versionado contém catálogo (metadados e referências content://) e fila (posição,
faixa e modos). Não contém músicas, capas, permissões de acesso ou chaves de assinatura.
Limites: 10 MiB por arquivo, 10.000 registros no catálogo exportado e 200 entradas na fila.
Versões/campos desconhecidos e dados inválidos são rejeitados antes de modificar o banco.

**Escolher backup para conferir** apenas lê e mostra a quantidade de registros. A alteração
só ocorre em **Confirmar restauração**. O player pausa; catálogo e fila são substituídos.
Antes disso, uma cópia dos dados anteriores é gravada atomicamente no armazenamento privado.
**Exportar cópia anterior** permite salvá-la como JSON para conferir e restaurar pelo mesmo fluxo.
Essa cópia é substituída na próxima restauração e não sobrevive à desinstalação/limpeza de dados.

O banco migra sem apagar a biblioteca. Catálogo e registro de recuperação da fila compartilham
uma transação; falha SQL desfaz a alteração. O serviço aplica a fila e persiste seu estado;
se o processo for interrompido depois da transação, a próxima inicialização recupera o registro.
A restauração nunca inicia áudio automaticamente. Se o serviço não conseguir aplicar a fila,
o aplicativo orienta reabrir e preserva o registro de recuperação.

Arquivos movidos, permissões revogadas ou reinstalação podem exigir nova seleção/importação
dos originais. O backup não transfere acesso aos arquivos entre aparelhos. Capas ausentes
podem ser regeneradas por reimportação. Originais não são apagados pela restauração.

Validação: 26 testes Kotlin, três suítes de interface (player, biblioteca e backup), build
desktop e verificação de estrutura. Os testes de navegador simulam a ponte; os testes SQLite
usam API 24 simulada. O seletor de documentos e a restauração completa precisam de aceite real.

Roteiro no A56: exportar com uma fila conhecida; alterar catálogo/fila; escolher o JSON,
conferir a prévia e cancelar; repetir e confirmar; verificar pausa, registros, posição e modos;
fechar/reabrir; exportar a cópia anterior e restaurá-la. Tentar um JSON inválido e conferir
que o estado válido é preservado. Guardar o JSON fora do armazenamento privado do app.

## Quinta etapa — favoritas locais (0.5.0)

Em **Todas as músicas**, marque **Favoritar** na faixa. **Favoritas** filtra o catálogo;
busca, artista, álbum e paginação continuam combináveis. O estado do botão é anunciado
por `aria-pressed` e indicado visualmente. A fila e os arquivos originais não são alterados.
A escolha fica no SQLite, sobrevive a reabertura e é preservada ao reimportar metadados.
Arquivos diferentes com o mesmo título mantêm escolhas independentes. Remover o registro
remove também sua marcação; reimportar um registro removido começa sem marcação.

O banco migra da versão 1/2 para 3. Backups novos usam formato 2 e guardam favoritas.
Backups formato 1 da 0.4.0 continuam legíveis, mas não contêm favoritas: restaurá-los
substitui as escolhas atuais por nenhuma. A confirmação informa esse comportamento.
O aplicativo 0.4.0 não entende o formato 2; use a versão atual para restaurar backups novos.
A cópia privada anterior também inclui favoritas e pode ser exportada pelo fluxo existente.

São favoritas de **músicas locais**. Favoritos de álbuns e coleção do desktop serão
migrados separadamente. Plano e referência visual OpenTune em
[ROADMAP_ANDROID.md](../docs/ROADMAP_ANDROID.md#plano-incremental-atualizado--31102026).

Aceite no aparelho: atualizar sem limpar dados, marcar duas músicas, filtrar/buscar,
reabrir, reimportar os mesmos arquivos e conferir as escolhas; exportar backup, mudar
as favoritas, restaurar e conferir a recuperação. Remover uma marcação não deve afetar
a música em reprodução. Testar um backup 0.4.0 e conferir a mensagem antes de confirmar.

## Sexta etapa — playlists locais (0.6.0)

Crie uma playlist em **Playlists locais**. Na biblioteca, **Adicionar à playlist**
seleciona uma música; escolha a playlist de destino e confirme a adição. Cada faixa
entra uma vez por playlist. É possível renomear, subir/descer/remover faixas, tocar
a playlist ou adicioná-la à fila. Exclusão pede confirmação e preserva catálogo,
áudios e a fila em andamento. Remover um registro da biblioteca também retira suas
referências das playlists. A ordem e os nomes ficam salvos no SQLite.

Limites explícitos: 100 playlists e 200 entradas em cada uma. A fila continua limitada
a 200 entradas; adicionar uma playlist que ultrapassaria o limite é rejeitado por inteiro.
Acesso a todos os arquivos é conferido antes de substituir a fila. A preparação tem
prazo de 30 segundos e uma resposta tardia não inicia reprodução após o prazo. Isso
não comprova suporte ao codec: erros de decodificação ainda são reportados pelo player.
Alterações verificam a revisão da playlist; telas antigas precisam ser recarregadas.

Banco migra para versão 4, preservando músicas, favoritas e recuperação pendente.
Backup formato 3 inclui playlists e ordem; os formatos 1/2 continuam legíveis, mas
restaurá-los remove as playlists atuais, conforme aviso da confirmação. A cópia anterior
inclui as playlists existentes antes da restauração. Backups Android continuam distintos
do formato desktop. A importação de playlists desktop é uma etapa futura.

O armazenamento desta etapa usa o banco Android existente, para restaurar biblioteca,
playlists e fila em uma transação. O núcleo Rust desktop fixa outro arquivo/esquema e
campos de arquivos desktop; não foi conectado diretamente às URIs SAF neste passo.
Não há servidor Python no Android.

Validação local: 42 testes Kotlin em JVM/API 24 simulada, quatro suítes de navegador,
APK universal 0.6.0 compilado e verificado, build desktop e estrutura aprovados.
No aparelho: criar, adicionar duas faixas, reordenar, reabrir, tocar, adicionar à fila,
exportar/restaurar backup e excluir conferindo que os originais continuam intactos.

## Sétima etapa — álbuns locais, artistas e coleção (0.7.0)

**Álbuns e coleção** reúne o catálogo local por artista do álbum, título e ano. Edições
com anos diferentes e nomes não latinos permanecem separadas. Os filtros **Todos os
álbuns**, **Álbuns favoritos** e **Coleção** combinam busca, artista e páginas de 50.
Favoritar um álbum não favorita suas faixas, e entrar na coleção não implica favorito.
Até 2.000 álbuns podem ser marcados entre favoritos e coleção; atingir o limite rejeita
a nova marcação sem descartar as existentes.

**Ver músicas** abre a biblioteca filtrada para a edição; **Ver artista** filtra a lista
de álbuns e a biblioteca. Os detalhes locais reaproveitam esses filtros; ainda não há
biografia ou discografia online. O filtro da biblioteca considera artista da faixa e
do álbum, incluindo compilações. Esses botões não mudam a fila nem iniciam áudio.

Marcações usam metadados persistentes e continuam salvas mesmo sem arquivos locais;
nesse caso o álbum indica zero músicas disponíveis e **Ver músicas** fica desabilitado.
**Remover registro** continua preservando o arquivo, mas retira a faixa das playlists.
Reimportação de tags não apaga os álbuns marcados. Tags idênticas não permitem distinguir
edições diferentes: não há identificação acústica nem dedução da gravação real.

SQLite migra para versão 5 sem perder favoritas de faixas, playlists ou recuperação
pendente. Backup formato 4 inclui os álbuns marcados e lê os formatos 1/2/3 anteriores.
Restaurar formatos antigos substitui as marcações atuais por nenhuma, conforme aviso
na confirmação; a cópia anterior também guarda a coleção. Formatos novos exigem o app atual.

Validação local: 50 testes Kotlin, cinco suítes de navegador, APK ARM 32/64 compilado,
assinatura debug local verificada, build desktop e estrutura aprovados. O APK do GitHub
usa a identidade fixa, conferida antes do upload. Falta aceite físico da 0.7.0 no A56.

Roteiro: conferir atualização sem perda dos dados anteriores; criar uma playlist,
adicionar/reordenar/tocar; guardar duas edições na coleção, favoritar somente uma;
reabrir e conferir escolhas; exportar backup, alterar dados e restaurar; conferir que
fila volta pausada e arquivos continuam disponíveis. Testar também sem rede e com
permissão revogada. Reprodução, seletor e interrupções reais não são simulados pelo navegador.

## Oitava etapa — navegação e player completo (0.8.0)

- **Início**: escolher arquivos para a fila e atalhos de músicas, favoritas, coleção e playlists.
- **Busca**: pesquisa local dos arquivos importados. A busca online ainda não está migrada.
- **Biblioteca**: categorias Músicas, Álbuns e Playlists, com os filtros e editores anteriores.
- **Ajustes**: backup, restauração e informações desta versão.

O miniplayer acompanha a mesma sessão Media3 em todas as telas. Tocar/pausar continua
acessível nele. Toque no título para abrir o player ou no ícone da fila para ir direto
a esse painel. O player completo tem capa/metadados, progresso, seek, atalhos de dez
segundos, shuffle, repetição, anterior/próxima e controles persistentes ao editar a fila.
O menu **•••** preserva **Escolher músicas** para substituir a seleção. **Adicionar à fila**
abre o seletor para acrescentar arquivos, respeitando o limite de 200 entradas.
Playlists, favoritas e coleção permanecem nas categorias da biblioteca.

Navegar preserva filtros/edições em memória e não recria o serviço de áudio. As listas
só são montadas/consultadas quando sua tela está ativa; após a primeira visita, os
componentes mantêm estado, mas liberam as linhas renderizadas ao sair. Busca foca o
campo automaticamente. Favoritas/coleção do Início abrem os filtros correspondentes.
Sair de uma tela durante uma operação nativa não cancela ou desfaz SQL em andamento;
a exclusão mútua entre operações permanece ativa até a conclusão.

O player usa diálogo modal: foco contido em Tab/Shift+Tab, Escape para minimizar e
retorno ao botão de origem. Histórico do WebView controla navegação e player; o Voltar
Android deve usar o tratamento padrão Tauri, cujo código foi inspecionado. A fila é um
painel do mesmo player; Voltar/Escape minimiza o player também quando a fila está aberta.
O comportamento do botão Voltar real e do TalkBack precisa de aceite no aparelho.

A capa vem do thumbnail privado gerado na importação, lido fora da thread de interface
nativa. O comando verifica a faixa atual e usa o player do serviço para evitar uma timeline
atrasada do controller após restauração. Imagens não são enviadas nos snapshots de
progresso. A interface descarta respostas de outra faixa e invalida os detalhes após
importação/restauração, mesmo com o mesmo ID. Arquivos não importados podem não ter
thumbnail; falta/falha de capa usa placeholder e preserva reprodução. Metadados nativos
podem ser usados como fallback. Reabrir sem artista conhecido tenta carregar novamente.

A janela Android aplica insets de barras do sistema/cutout ao contêiner da WebView.
O rodapé é medido dinamicamente para reservar espaço no conteúdo; uma redução de
viewport enquanto um campo textual está focado oculta o dock para acomodar o teclado.
Não houve novo teste físico no A56/Android 7: teclado, gestos, barras, TalkBack e fonte
ampliada nativos continuam pendentes. Testes Chromium não comprovam esses casos Android.

Validação local: 52 testes Kotlin, seis suítes de navegador, APK ARM 32/64, assinatura
debug local, build desktop e verificação de estrutura aprovados. Banco e formato de
backup continuam nas versões 5/4 da 0.7.0; esta etapa não altera os dados salvos.
Capturas reais do frontend em Chromium com ponte/dados de teste em
[artifacts/android-0.8.0](../artifacts/android-0.8.0/README.md).

## Nona etapa — exploração online inicial (0.9.0)

Em **Busca → Online**, escolha Artistas, Álbuns ou Músicas e confirme **Pesquisar**.
O texto é enviado ao MusicBrainz somente após essa ação. A busca local continua em
**No aparelho**, sem depender da rede nem perder seu texto ao alternar a origem.
Não há dependência do Flask/Python do desktop nem requisição MusicBrainz pela WebView:
a consulta HTTPS ocorre no plugin Android, sem chave de API ou autenticação.

O fluxo é artista → grupos de lançamentos → edição → faixas. Edições preservam MBIDs,
data, país e status retornados, sem juntar álbuns pelo título. Uma gravação pesquisada
pode abrir lançamentos associados; essa lista pode ser incompleta e a interface informa
isso. Faixas de discos múltiplos mantêm sua identificação e duração em milissegundos;
duração ausente não é inventada. A fonte não garante cobertura de todos os artistas.

**É catálogo de informações, ainda sem reprodução ou download dessas músicas.**
Nenhum item online é colocado na fila local, favorito ou coleção automaticamente.
Não foram resolvidos URLs de áudio, IDs YouTube ou integração de conta OpenTune/YouTube
Music. O site OpenTune continua como referência de organização; o código desta etapa
é próprio e o provedor de metadados é MusicBrainz, diferente do catálogo desktop atual.

Resultados remotos são paginados em 25, até página 400/10.000 itens por consulta;
consultas maiores precisam de refinamento. Detalhes retornam até 1.000 itens e listas
longas são renderizadas em páginas locais de 50, sem novas consultas. Voltar preserva
as páginas no histórico. Nenhuma consulta é feita por digitação; mudanças de texto,
rota ou origem cancelam a solicitação anterior, e respostas atrasadas são descartadas.
Uma consulta online em andamento não bloqueia navegação nem interrompe áudio local.

O cliente usa User-Agent do projeto, intervalo mínimo de 1,1 segundo entre chamadas,
conexão/leitura limitadas e desconexão por prazo. A interface tem prazo adicional de
35 segundos e cancelamento explícito. HTTP redirecionado, inválido, não JSON, conteúdo
maior que 2 MiB e IDs/respostas incompatíveis são rejeitados. Não há execução de código
ou navegação para URLs fornecidos pelos resultados.

Cache privado em `cacheDir/online-catalog-v1`: até 40 consultas/16 MiB, com arquivo
atômico e recuperação de escrita interrompida. Respostas válidas são reutilizadas por
dez minutos; **Atualizar catálogo** solicita a fonte novamente. Em falha, uma cópia de
até 30 dias pode aparecer com data e indicação de indisponibilidade. JSON inválido não
substitui cache válido. Esse cache pode ser removido pelo Android e não integra o backup
pessoal. Biblioteca SQLite versão 5 e backup formato 4 permanecem inalterados.

Validação: 64 testes Kotlin de comportamento/persistência aprovados e sete suítes de
navegador com ponte simulada. Uma sondagem real nativa do MusicBrainz é opt-in no CI,
com resultado separado; a indisponibilidade do provedor não bloqueia o APK. O ambiente
Codex bloqueou a conexão HTTPS ao domínio (proxy 403). A validação de rede real e do
TLS no A56/Android 7 deve ser registrada separadamente, sem confundir fixtures com API real.

Roteiro no aparelho: reproduzir um arquivo local, abrir Online, buscar um artista,
consultar álbum/edição/faixas, voltar, cancelar uma busca, trocar para No aparelho e
conferir a continuidade. Repetir uma busca já carregada sem rede e conferir a data/cache.
Os resultados online desta etapa não têm botão Tocar; reprodução online é a próxima prova.


Publicação confirmada: [CI 41884064137](https://github.com/BadZ7br/BZtune/actions/runs/41884064137)
concluído com sucesso para `50baad2`, versão 0.9.0. Baixar em **Artifacts →
BZtune-Android-7-teste-assinatura-estavel**, extrair o ZIP e instalar o APK sobre a versão
anterior com a mesma identidade fixa. O workflow verificou o certificado e a sondagem
real MusicBrainz passou, registrada em `MusicBrainz-consulta-real-validada`.
A execução anterior foi substituída pela mais recente e cancelada durante o upload;
a execução final completou o envio. Não usar o APK debug local para substituir uma
instalação de identidade fixa. Ainda falta validar consultas/TLS no A56 e Android 7.

## Redesenho em andamento — Início local

O código em desenvolvimento inclui as etapas de frontend registradas em
[ANDROID_FRONTEND_REDESENHO.md](../docs/ANDROID_FRONTEND_REDESENHO.md), posteriores ao APK
0.9.0 publicado acima. O novo Início usa a fila atual, favoritas e a ordem real de
inclusão no catálogo. SQLite 6 e backup 5 preservam essa ordem; backups 1–4 continuam
aceitos sem inventar uma ordem para os arquivos antigos. Reimportação não sobe uma
faixa existente ao topo. O resumo tem até seis cards por seção e não depende de rede.

Frontend, ponte Rust e plugin Kotlin precisam ser compilados juntos. A compilação
debug local ARM 32/64 foi validada; ainda não há nova publicação assinada destas
etapas nem validação física da migração.

O player em desenvolvimento também oferece favorita pelo vínculo com o arquivo
importado, fundo derivado da capa privada e fila em painel inferior. Não há busca de
imagens pela rede. Ações de fila continuam baseadas em ID/posição e o rodapé mantém
Player, Fila e Adicionar à fila. O progresso e as evidências estão no documento de
redesenho acima; estas mudanças ainda não integram uma nova publicação assinada.

As sugestões restantes do redesenho foram implementadas em desenvolvimento: ordenação
global, capas locais dos álbuns, seleção em lote, temporizador no serviço e letras
LRCLIB/LRC. Veja as etapas 6–9 no relatório para limites e validação. LRC importado
ainda é temporário; a API real do LRCLIB foi bloqueada pelo proxy do ambiente.
Nenhuma dessas alterações corresponde a uma nova publicação com assinatura fixa.

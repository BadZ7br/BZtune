# BZtune Android — biblioteca e reprodução local

Mínimo configurado: **Android 7 / API 24**. Aplicativo de teste independente:
`com.bztune.android.preview`, versão de teste 0.4.0. Não substitui o desktop.
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

Busca online, playlists, favoritos/coleção, downloads, letras, equalizador e demais
funções do desktop ainda não foram migrados. Este APK prova a fundação mobile. A fila de teste aceita até 200 entradas e rejeita
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

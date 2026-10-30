# Planejamento Android do BZtune

Proposta de 30/10/2026, baseada no código publicado da linha 2.0.12 e na revisão
do repositório neste planejamento. Não representa um APK já desenvolvido/testado.
Público: Brasil. Cobertura solicitada: Android 6 (API 23) até a versão mais recente. Direção: migração gradual com Tauri 2, mantendo o desktop.
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

Não há medição atual de participação por Android no Brasil nesta proposta. O proprietário
solicitou Android 6 (API 23) até a versão mais recente, substituindo o piso candidato
anterior de Android 8. Esta é uma meta de cobertura, não suporte já garantido.

Na consulta ao upstream Tauri (branch dev, não uma versão fixada para nosso build),
a configuração padrão usa minSdk 24 (Android 7), enquanto o módulo Android da biblioteca
Tauri declara minSdk 21. Isso não demonstra, por si só, suporte completo à API 23:
CLI, runtime, WebView, plugins, Media3 e bibliotecas Rust precisam ser fixados e testados
em conjunto. Não basta reduzir o número no manifesto. Referências consultadas:
https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-utils/src/config.rs e
https://github.com/tauri-apps/tauri/blob/dev/crates/tauri/mobile/android/build.gradle.kts.

Incluir uma prova de compatibilidade API 23 na entrega 1, antes de avançar a migração.
Se houver bloqueio real, apresentar a dependência e as alternativas: avaliar adaptação
compatível/manutenível ou rever arquitetura/piso com o proprietário. Não elevar o
mínimo silenciosamente nem criar uma segunda aplicação sem decisão explícita. minSdk, targetSdk e compileSdk têm finalidades distintas.
Usar requisitos oficiais vigentes na implementação/publicação, sem fixar um target antigo.

Começar por arm64-v8a em aparelho e x86_64 no emulador. Avaliar 32 bits conforme aparelhos
reais; validar compatibilidade de bibliotecas nativas com páginas de 16 KB quando exigida.

Matriz inicial: Android 6/API 23 como alvo obrigatório de investigação, Android 7–9 para a faixa antiga; Android 10–12 para armazenamento; 13–14 para permissões;
15–16 e a versão estável mais recente disponível na implementação para comportamento atual.
Incluir Samsung/Motorola e, conforme acesso, aparelho com restrições fortes de bateria.
Essas escolhas cobrem comportamentos; não representam ranking de mercado.

Automatizar contratos, migrações, fila, respostas inválidas, offline e atualização.
Em aparelho real: Bluetooth/fones, chamadas/foco, tela apagada, bateria, armazenamento e
reabertura. Emulador sozinho não aprova esses cenários. Medir consumo de memória, travamentos
e bateria; estabelecer orçamento após a prova, sem inventar metas antes de medir.

## OpenTune e decisões pendentes

OpenTune continua como referência desejada de experiência. O levantamento anterior em
PLANO_ANDROID_BRASIL.md não conseguiu verificar a ficha/código exatos. Identificar link
acessível e versão antes de comparar arquitetura, licença ou copiar implementação.
A direção Media3 é recomendação para BZtune, não uma afirmação sobre o código do OpenTune.

Canal inicial confirmado: GitHub APK. Testar o A56 como aparelho principal e o J5
como candidato para limite inferior. No J5, confirmar código SM-J…, versão do Android,
ABI do sistema e WebView antes de decidir suporte. Algumas gerações/instalações podem
estar no piso Android 6 solicitado; não prometer compatibilidade apenas pelo nome J5.
Registrar versão/modelo exatos para testar a meta Android 6; não exigir atualização do
aparelho como solução automática. 32 bits também deve ser
verificado no sistema, não deduzido apenas da capacidade do processador.

Decidir estratégia de fonte online após a
prova técnica, e consolidar piso Android a partir da matriz de compatibilidade.
Não há prazo fechado: áudio local e fonte online são marcos que permitem estimar o restante.

Primeiro trabalho de implementação recomendado: entrega 0 e esqueleto mobile da entrega 1,
em mudanças pequenas, sem modificar o mecanismo de reprodução desktop nessa primeira etapa.

# BZtune Android — primeira etapa

Mínimo configurado: **Android 7 / API 24**. Aplicativo de teste independente:
`com.bztune.android.preview`, versão inicial 0.1.0. Não substitui o desktop.
O frontend compartilha o projeto React/TypeScript, mas tem entrada mobile própria,
sem Flask, localhost:5000, executáveis Windows ou updater desktop.

## O que existe

- Seleção de um áudio via Storage Access Framework (`ACTION_OPEN_DOCUMENT`).
- URI `content://` e permissão persistente, sem acesso geral ao armazenamento.
- Player Media3 em `MediaSessionService`: tocar/pausar, seek e pausa ao desconectar fone.
- Sessão para controles do Android, foco de áudio e notificação de reprodução.
- Recuperação da última faixa/posição registrada em eventos do player, sempre pausada.
  A retomada não garante salvar o instante exato de um encerramento abrupto.
- Interface inicial em português; seletor cancelável, erro recuperável e controles de toque.

A fila completa, biblioteca, busca online, downloads, letras, equalizador e demais
funções do desktop ainda não foram migrados. Este APK prova a fundação mobile.
A notificação/segundo plano e os formatos precisam ser validados em aparelho real:
compilação e teste de interface não comprovam comportamento de áudio no A56 ou J5.
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
artefato **BZtune-Android-7-teste** no GitHub Actions, quando o build termina com sucesso.
Não publica uma atualização Windows nem uma versão estável Android.

O APK de teste remove símbolos nativos de depuração para reduzir o tamanho, mas
continua sendo um build de desenvolvimento. Estes builds usam certificado **debug**, de desenvolvimento. Chaves de runners diferentes
podem variar: não prometem atualização sobre um APK anterior nem identidade de produção.
Antes de distribuir uma versão persistente, criar canal e chave Android de teste estáveis.
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

## Validação da primeira implementação

Build local completo aprovado (Rust aarch64/armv7 + Kotlin/Java + APK). Conferência do
pacote: minSdk 24, targetSdk 37, duas ABIs ARM, assinatura debug válida, 31,4 MiB.
SHA-256 do APK local desta validação:
`4cfc944bed2a5c417c86fbbde44b591e2420ed111414323944e193cb6a52b913`.
O APK do GitHub pode ter hash diferente por usar outro certificado debug/ambiente.

Teste de interface aprovado em 320 e 412 px, incluindo cancelamento e resposta inválida.
Regressão desktop: 230 testes Python aprovados (um exclusivo de Windows ignorado),
125 testes JavaScript e build desktop aprovados. Verificação de estrutura aprovada.
Áudio real, notificação, tela apagada, bateria e fones **ainda aguardam teste no aparelho**.

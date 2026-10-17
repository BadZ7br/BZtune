# BZtune Desktop — distribuição e atualizações (plano v2.0)

Estado: **planejamento; distribuição não habilitada**. Este documento não disponibiliza um instalador.

## Separação dos repositórios

- **Fonte privado:** `BadZ7br/BZtune`. O código, os testes e os workflows de build permanecem aqui, na branch `feature/desktop-v2` até a revisão.
- **Releases público (a criar):** `BadZ7br/BZtune-Releases`. Conterá apenas instaladores Windows, pacotes de atualização, assinaturas, arquivo `latest.json` e notas de versão. Nunca copiar SQLite, áudios, caches, arquivos .env ou chaves privadas.
- O usuário confirmou que autoriza downloads públicos. **Isso não autoriza publicar o código-fonte privado.** O bundle React, por ser parte de um executável distribuído, ainda poderá ser inspecionado por quem receber o instalador.

## Preparação do repositório público

Criar manualmente `BadZ7br/BZtune-Releases` com visibilidade **Public**, README inicial e nenhum arquivo de produção. Verificar a visibilidade antes da primeira publicação.

## Dependências e bloqueios obrigatórios

1. Ter um Desktop Tauri 2 que abra o frontend compilado sem servidor Vite.
2. Incluir backend Flask via sidecar (PyInstaller) e FFmpeg/FFprobe. O usuário final não deve instalar Node/Python/Rust nem abrir terminal. As versões serão empacotadas e testadas.
3. O backend deve escutar **somente 127.0.0.1**; restringir CORS e ações sensíveis a origens confiáveis do aplicativo. Tratar conflitos de porta, encerramento limpo e não iniciar múltiplas instâncias.
4. Manter SQLite e conteúdo do usuário em diretório estável fora da pasta de instalação (p.ex., %LOCALAPPDATA%/BZtune); migrar dados somente com cópia de segurança e testes de rollback.
5. Gerar chave pública/privada do **Tauri Updater**; guardar a privada fora do código e em segredo do repositório fonte. A chave pública entra na configuração do aplicativo. **Nunca** publicar a privada nem incorporá-la ao instalador.
6. Habilitar `bundle.createUpdaterArtifacts: true`; usar endpoint HTTPS somente após publicar um `latest.json` assinado. A atualização requer a assinatura gerada para o instalador e não deve aceitar assinatura vazia/forjada.
7. O build no repositório privado precisa de autenticação restrita para escrever Releases no outro repositório. O `GITHUB_TOKEN` do workflow do repositório fonte **não** autoriza automaticamente gravação em outro repositório. Usar um token de instalação do GitHub App com escopo mínimo ou um token fine-grained limitado a `BZtune-Releases`, guardado em Actions Secrets, idealmente protegido por ambiente com revisão.
8. Publicar somente de tag/fluxo de release controlado, nunca de PR de origem desconhecida. Validar instalador, smoke tests, versões e assinatura antes de publicar.
9. Na área Configurações → Sobre → Atualizações: **Buscar atualizações**, versão atual/mais recente, notas, progresso de download, instalação confirmada e falhas tratadas. Não instalar automaticamente sem consentimento.

## Pipeline proposto

1. GitHub Actions Windows: checkout de fonte privado → build/test React → testes Flask → PyInstaller para sidecar → conferir FFmpeg e caminhos de dados → build Tauri NSIS.
2. Assinar os artefatos do updater com a chave privada do Tauri armazenada como segredo. Não registrar segredos em logs.
3. Verificar checksums, metadados, arquiteturas e assinatura. Subir `BZtune-Setup.exe`, `BZtune-Setup.exe.sig`, `latest.json` e changelog ao repositório público.
4. Testar a instalação numa máquina Windows limpa: primeira execução sem ferramentas dev, reprodução online/offline, playlists, download autorizado, backup, atualizador, atualização in-place, desinstalação sem apagar biblioteca.

## Contrato de atualização

- Tauri Updater v2; Windows x64 primeiro.
- Endpoint futuro quando existir Release público: `https://github.com/BadZ7br/BZtune-Releases/releases/latest/download/latest.json`.
- `latest.json` precisa de `version` SemVer, `platforms.windows-x86_64.url` HTTPS válido e `platforms.windows-x86_64.signature` com **conteúdo** real do .sig, não caminho ou URL.
- A distribuição inicial não é considerada pronta enquanto o fluxo de assinatura e atualização real não passar em um Windows limpo.

Referências:
- https://v2.tauri.app/plugin/updater/
- https://v2.tauri.app/distribute/pipelines/github/
- https://v2.tauri.app/start/prerequisites/

# BZtune Desktop v2.0 — arquitetura e publicação

**Estado em 17/10/2026:** consolidação do GitHub em andamento, repositório ainda privado; releases oficiais desativados. Nenhuma atualização assinada foi validada entre duas versões.

## Repositório único

- **Código-fonte e Releases:** `https://github.com/BadZ7br/BZtune`.
- Branch estável: `main`; desenvolvimento Desktop: `feature/desktop-v2`; integração mediante PR e testes.
- O repositório antigo `BZtune-Releases` permanece temporariamente como contingência, sem lançamentos; apagar **somente depois** de validar downloads públicos no repositório principal.
- Não divulgar o código do BZtune antes de limpar o **histórico Git**: ver `docs/AUDITORIA_PUBLICACAO_GITHUB.md`.
- O Git não deve conter dados da biblioteca, capas cacheadas, músicas, banco SQLite, backups, tokens ou chaves de assinatura.

## Arquitetura atual

- Tauri 2 renderiza React/Vite.
- PyInstaller empacota Flask + Python como sidecar; FFmpeg e FFprobe são recursos inclusos no NSIS.
- O backend é iniciado pelo programa, escuta apenas `127.0.0.1` e guarda dados do Desktop em `%LOCALAPPDATA%/BZtune/library`.
- A prévia Windows NSIS compilou com sucesso no Actions. **A instalação e reprodução no PC sem ferramentas dev ainda precisam de validação real.**
- Há comandos Rust para buscar/instalar atualização e script frontend `doomvault/public/desktop-updates.js` para a UI. O fluxo final de duas versões assinadas ainda não foi testado.
- A configuração de desenvolvimento mantém `createUpdaterArtifacts: false` e chave pública provisória; o workflow de release injeta a chave pública e ativa artefatos assinados quando os segredos estiverem disponíveis.

## Publicação oficial — apenas após aprovação

1. Finalizar auditoria de privacidade e reescrever o histórico para excluir blobs indevidos; não realizar push forçado sem revisar refs/PRs e uma cópia privada verificável.
2. Validar `npm run build`, testes Python e compilação NSIS pela CI; executar a prévia em Windows limpo.
3. Criar chave de assinatura Tauri local e proteger os secrets no Environment `desktop-release` do repositório BZtune; instruções em `docs/DESKTOP_SECRETS_SETUP.md`.
4. Integrar a branch Desktop à `main` depois da revisão, e fazer o repositório ficar público após o histórico estar higienizado.
5. Executar manualmente `Desktop - Publicar instalador e atualizações` na `main`, com versão SemVer estável e aprovação humana.
6. O GitHub Actions terá `contents: write` somente no job de publicação, usando o `GITHUB_TOKEN` temporário do próprio `BZtune`. Não é necessário token entre repositórios.
7. Gerar `BZtune-Setup-vX.Y.Z-x64.exe`, sua assinatura de atualização `.sig` e `latest.json`. Instalar duas versões sucessivas e conferir os arquivos da biblioteca depois da atualização.
8. Desativar ou excluir o antigo `BZtune-Releases` quando os downloads e as atualizações do `BZtune` principal estiverem funcionando.

## Endereços de distribuição

- Releases: `https://github.com/BadZ7br/BZtune/releases`
- Feed: `https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json`

**A assinatura Tauri não substitui o certificado Authenticode do Windows.** A UI precisa de confirmação de instalação, estado de progresso e falhas tratadas.

Veja `docs/PROXIMOS_PASSOS_DESKTOP_V2.md` para a retomada do trabalho.

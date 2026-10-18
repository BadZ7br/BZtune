# BZtune — ponto de retomada do Desktop v2.0

**Atualização da organização (17/10/2026):** a limpeza da árvore da `main` foi aplicada (4.510 imagens de cache, 13 `.pyc`, um backup obsoleto, um JSON de estado local, um componente e dois auxiliares de frontend legados, mais um README antigo). A mesma exclusão foi aplicada à `feature/desktop-v2`. O instalador e o feed de atualizações agora apontam para os **Releases do próprio `BadZ7br/BZtune`**. GitHub Actions validou o código após as modificações. **O histórico antigo ainda contém os blobs e precisa ser filtrado antes da publicação pública**; veja `docs/AUDITORIA_PUBLICACAO_GITHUB.md` e `scripts/maintenance/preparar_historico_publico.ps1` na `main`. O repositório `BZtune-Releases` continuará intacto até confirmar downloads no repo único.



**Data:** 2026-10-17
**Branch de trabalho:** `feature/desktop-v2` — não mexer na `main` sem revisão.
**Pull request em andamento:** #1 — Desktop v2.0.
**Objetivo do usuário:** manter **apenas um repositório GitHub chamado BZtune** e, depois dessa organização, continuar a versão Windows sem terminal e com atualizações dentro do aplicativo.

## Estado verificado

- `BadZ7br/BZtune`: privado, código-fonte React/Flask e branch Desktop.
- `BadZ7br/BZtune-Releases`: público, sem releases publicados (apenas README).
- A branch Desktop tem Tauri 2, launcher Flask PyInstaller, FFmpeg, workflow de prévia NSIS e workflow de release.
- O Actions **Desktop Windows - Gerar instalador de teste** concluiu com sucesso (run `39063767245`), produzindo artifact `BZtune-Desktop-Windows-Preview`. O sucesso do build **não confirma** o funcionamento pós-instalação em um Windows limpo.
- A configuração da prévia mantém `createUpdaterArtifacts: false` e chave pública placeholder. Os comandos Rust de atualização existem, mas ainda não há interface React integrada para buscar/instalar.
- Não há versão publicada no repositório Releases, nem validação de atualização assinada entre duas versões.
- O diretório `BZtune_backups/` está rastreado na `main`; auditar todo o histórico, os arquivos de backup e segredos **antes de tornar o repositório público**.

## Decisão obrigatória para consolidar em UM repositório

O GitHub não permite que os **Releases de um repositório privado** sejam baixados publicamente sem autenticação. Escolher uma das alternativas **antes de mudar visibilidade ou excluir repositórios**:

1. **BZtune público:** um único repositório para código e instaladores/updates públicos no mesmo GitHub Releases. Isso torna código e histórico acessíveis a todos — requer auditoria de privacidade, licenças e segredos antes da mudança.
2. **BZtune privado:** um único repositório para código e releases privados. Instaladores só serão acessíveis por quem tem autorização no GitHub; para oferecer downloads públicos sem abrir o código será necessário outro serviço de distribuição (fora do GitHub Releases do repo privado).

Até a decisão: **não tornar o projeto público, não deletar `BZtune-Releases`, não mover a `main` nem publicar instaladores**. Um repositório deletado não deve ser tratado como sem impacto apenas por ainda não ter Releases.

## Próximas mudanças técnicas, após organização

1. **Validar a prévia NSIS no Windows:** instalação sem terminal, sidecar Flask, dependências embutidas, player online/offline, playlists, downloads permitidos, encerramento e porta local.
2. **Central de atualizações React:** `Configurações → Sobre → Buscar atualizações`, versão instalada, changelog, progresso, opção de instalar com confirmação, estados de erro; conectar aos comandos `desktop_check_update` e `desktop_install_update`.
3. **Assinatura Tauri Updater:** chave de assinatura privada armazenada em Actions Secrets; chave pública aplicada durante build; nunca versionar ou enviar a chave privada ao chat.
4. **Pipeline de Release:** endereço do endpoint HTTPS e permissões de publicação de acordo com a opção de repositório escolhida. Verificar `createUpdaterArtifacts`, anexos NSIS, `.sig` e `latest.json` válido.
5. **Preservação de dados:** garantir localização em %LOCALAPPDATA%/BZtune, importar biblioteca web mediante ação segura e backup, nunca sobrescrever SQLite, músicas, covers, histórico ou playlists durante upgrade/desinstalação.
6. **Testes de atualização assinada:** instalar vA, publicar vB assinada com mesma chave, procurar e instalar pela interface, verificar integridade e rollback quando possível.
7. **Finalizar versão pública:** somente depois de executar os testes end-to-end e decidir publicação e licença. Não confundir assinatura Tauri com certificado Authenticode do Windows.

## Links

- Pull Request em andamento: https://github.com/BadZ7br/BZtune/pull/1
- Installer preview: https://github.com/BadZ7br/BZtune/actions/runs/39063767245
- Documentação atual do projeto: `docs/DESKTOP_RELEASES.md` e `docs/DESKTOP_SECRETS_SETUP.md`

Este registro serve para retomar a tarefa do ponto certo, sem prometer que funcionalidades não validadas já estejam prontas.

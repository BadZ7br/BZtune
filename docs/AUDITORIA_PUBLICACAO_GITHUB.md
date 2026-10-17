# Auditoria pré-publicação — BZtune

> **ATUALIZAÇÃO 17/10/2026 — limpeza da árvore concluída:** PR #2 foi integrado à `main`. Foram removidos do código atual os 4.510 caches, 13 arquivos `.pyc`, backup de teste e JSON de estado. Depois, quatro arquivos de frontend/documentação legados sem importações foram removidos da `main` e também da branch Desktop. O Desktop passou a apontar seu workflow/manifesto de atualização para `BadZ7br/BZtune/releases`. **O histórico Git permanece com os blobs antigos e NÃO está aprovado para tornar público.** A lista de constatações abaixo documenta o estado *anterior* à limpeza.

Data: 2026-10-17
Estado: **NÃO TORNAR O REPOSITÓRIO PÚBLICO AINDA.**

## Objetivo aprovado
Manter um único repositório **`BadZ7br/BZtune` público** para código-fonte e GitHub Releases de instaladores e atualizações. `BZtune-Releases` ficará intacto até a migração ser concluída e validada.

## Constatações feitas pelo inventário remoto do GitHub
- Repositório `BZtune` continua **privado**. `main` e `feature/desktop-v2` são diferentes; Desktop está em PR #1, ainda não incorporado.
- Na `main`, foram vistos **4.616 blobs rastreados**, somando aproximadamente **144.298.230 bytes**. Destes, **4.510 imagens** em `doomvault-api/cover_cache/` somam **143.275.232 bytes**; **13 arquivos `.pyc`** em `doomvault-api/__pycache__/` somam **276.936 bytes**.
- `BZtune_backups/testes_sqlite_windows_20261017_121201_407823/test_library_metadata.py` está rastreado (é código de teste duplicado, não um banco SQLite).
- `doomvault-api/doomvault_download_sources.json` está rastreado com conteúdo **`[]`**; é um arquivo de estado local e não deve receber novos commits.
- Os caches e os `.pyc` continuam rastreados nas cinco pontas de branches examinadas (`main`, `feature/desktop-v2`, `BadZ`, `acerola`, `refactor/estrutura-bztune`). Embora `.gitignore` já contenha as exclusões, arquivos anteriormente rastreados continuam no Git.
- Não foram identificados, **por nome de arquivo**, `.env`, bancos SQLite, MP3 ou FLAC, chaves `.pem/.pfx/.key`, nos snapshots atuais dessas cinco branches. Isso **não é uma certificação do histórico nem do conteúdo binário**.
- Exames por padrões comuns de credenciais nos arquivos principais do frontend, backend, testes, scripts e workflows **não identificaram tokens ou chaves privadas evidentes**. A auditoria automatizada tem limitações e não substitui varredura local com ferramentas de detecção de segredos.
- Commits antigos e novos apresentam campos de email de autoria que **não seguem o padrão padrão de privacidade `@users.noreply.github.com`**. Conferir se representam endereços pessoais **antes** de tornar o histórico público. Não divulgar as strings reais no relatório.
- `LICENSE` não foi encontrado na raiz. `desktop/src-tauri/Cargo.toml` declara `UNLICENSED`. A publicação de código visível não significa permissão automática para terceiros reutilizá-lo. Definir política de licença e avaliar autoria/uso de artes e dependências.
- O repositório público `BadZ7br/BZtune-Releases` está sem releases. A publicação de instaladores na conta principal **ainda não foi configurada**.

## Bloqueios — realizar ANTES de mudar a visibilidade
1. Fazer cópia de segurança **privada e verificável** de todos os refs e código atual (`git clone --mirror` e backup fora do repositório); confirmar que é possível recuperá-la.
2. Executar uma varredura local de segredos em **todo o histórico**, com `gitleaks` ou ferramenta equivalente, e inspecionar os dados binários (imagens de cache e bytecode) no repositório privado. Se uma chave real for descoberta, revogá-la/substituí-la antes de qualquer divulgação.
3. Conferir os emails dos commits e escolher se precisam ser convertidos para `noreply`. Ajustar também `git config user.email` e a opção de privacidade em GitHub Settings → Emails para commits futuros.
4. Preparar uma cópia limpa e independente do repositório (por exemplo, `git-filter-repo` para remover `doomvault-api/cover_cache/`, `**/__pycache__/**`, `BZtune_backups/` e o JSON de estado local de **todas** as referências e commits). **Não executar o filtro no diretório de trabalho do usuário e nunca perder a cópia mirror original.** O filtro reescreve os hashes; exige plano explícito de atualização remota e pode invalidar o PR atual.
5. Validar a cópia limpa: inspecionar todos os refs, fazer outra varredura por credenciais, verificar que não restaram blobs/caminhos indevidos, executar testes Python, `npm run build` e build/CI do Desktop no Windows.
6. Só após revisão e backup, substituir de forma coordenada o histórico GitHub pelo histórico limpo. Remover/arquivar referências antigas de forma consciente (branches antigas, PRs, tags e artefatos que ainda apontem para commits contaminados). **Apagar arquivos em um novo commit não remove o histórico antigo.**
7. Fazer inspeção final das abas `Code`, `Branches`, `Pull requests`, `Actions` e `Releases` antes de mudar `BZtune` para **Public**. Atenção: a disponibilização anterior de commits via links/cache da plataforma pode exigir tratamento separado se alguma credencial real tiver sido exposta.

## Consolidação para um único repositório — APÓS limpeza e testes
1. Tornar `BadZ7br/BZtune` público nas configurações do GitHub, após confirmar que o histórico foi saneado.
2. Alterar workflow `.github/workflows/desktop-release.yml`: usar publicação **neste mesmo repositório**, com permissão `contents: write` no job de release e token padrão do Actions (escopo mínimo). Remover referência a `BZTUNE_RELEASES_TOKEN` e a permissão entre repositórios.
3. Alterar `desktop/src-tauri/tauri.conf.json` e `desktop/scripts/make_release_feed.py` para o feed e URLs assinadas em `https://github.com/BadZ7br/BZtune/releases/...`.
4. Confirmar os segredos Tauri na configuração privada do Actions; nunca publicar `TAURI_SIGNING_PRIVATE_KEY` e jamais trocar a chave inadvertidamente entre versões.
5. Gerar instalador Windows, testar instalação limpa, biblioteca, backup e atualização entre duas versões assinadas.
6. Confirmar download **sem autenticação** dos artefatos públicos e só depois **excluir manualmente** o antigo repositório `BZtune-Releases`, após última checagem de que não há nada a preservar.

## Ponto de retomada das próximas funcionalidades
Ver também `docs/PROXIMOS_PASSOS_DESKTOP_V2.md`: Windows sem Python/terminal, sidecar Flask, interface **Configurações → Sobre → Buscar atualizações**, assinaturas, preservação de dados e testes entre versões.

### Importante
**Este relatório documenta riscos e procedimentos. A auditoria remota não executou a limpeza completa do histórico, a mudança de visibilidade ou a exclusão de qualquer repositório.** Nenhum instalador oficial foi publicado.

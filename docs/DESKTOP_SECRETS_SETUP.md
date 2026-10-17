# BZtune Desktop — publicação assinada em um único repositório

**Repositório único:** `BadZ7br/BZtune` (será público após a limpeza histórica de privacidade).  
**Situação:** releases oficiais e atualizador ainda não ativados; este documento não publica nada.

## 1. Preparar a chave de atualização Tauri

No computador do proprietário, gerar a chave do updater usando o CLI Tauri:

```powershell
cd desktop
npm install
npm run tauri -- signer generate -w "$env:USERPROFILE\.tauri\bztune-updater.key"
```

**Nunca adicionar a chave privada ao Git, abrir issues com ela, copiá-la para chats ou compartilhar logs contendo a chave.** Preservar cópia segura da chave privada e de sua senha. A chave pública `.pub` pode constar em configuração de build.

## 2. Actions Secrets e Environment

No único repositório `BadZ7br/BZtune` → **Settings → Environments**, criar `desktop-release`, com aprovação para publicar se disponível. Cadastrar:

- `TAURI_SIGNING_PRIVATE_KEY`: conteúdo da chave privada Tauri.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: senha, quando configurada.
- `BZTUNE_UPDATER_PUBLIC_KEY`: conteúdo da chave pública Tauri.

**Não há `BZTUNE_RELEASES_TOKEN`:** o workflow publica na aba **Releases do próprio BZtune** com `GITHUB_TOKEN` temporário e permissão `contents: write` só no job de release.

## 3. Requisitos para publicar

Antes de executar `Desktop - Publicar instalador e atualizações` na branch `main`:

1. Limpeza total do histórico e auditoria de privacidade concluídas; repositório tornado público após revisão.
2. PR do Desktop incorporado na `main`; testes Python/React e instalador Windows de prévia aprovados.
3. Execução real do instalador numa máquina Windows sem Node/Python, incluindo músicas locais, biblioteca, playlists, backups e encerramento correto do Flask.
4. Assinaturas Tauri e versão estável coerentes; gerar `latest.json` somente com a assinatura verdadeira do pacote.
5. Validar upgrade entre duas versões assinadas com a MESMA chave. Comprovar que SQLite, áudio, capas e configurações persistem.

O Windows pode mostrar um aviso SmartScreen: assinatura do Tauri Updater **não é** uma assinatura Authenticode do instalador.

## 4. Destino oficial futuro

- Releases: https://github.com/BadZ7br/BZtune/releases
- Feed: https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json

**Nunca eliminar o repositório secundário `BZtune-Releases` sem verificar a migração completa.**

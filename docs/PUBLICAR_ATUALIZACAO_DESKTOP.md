# Publicar uma atualização do BZtune

O atualizador consulta `https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json`. A release precisa conter `latest.json`, o pacote NSIS e sua assinatura `.sig`, gerados com a chave já usada pelas versões instaladas. O usuário inicia o processo em **Sistema → Atualizações → Buscar atualizações → Atualizar agora**.

## Pedido versionado de publicação

Para publicar uma versão estável, sincronize a versão em `desktop/package.json`, `desktop/package-lock.json`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml` e `desktop/src-tauri/Cargo.lock`. Atualize as notas em `desktop/release-notes.md` e o pedido em `desktop/release-request.json`:

```json
{
  "version": "2.0.7",
  "publish": true,
  "confirmation": "PUBLICAR v2.0.7"
}
```

Execute `python desktop/scripts/release_request.py` para conferir o pedido. Ao integrar a alteração desse arquivo na **main**, o workflow `desktop-release.yml` inicia a publicação. Commits que não alteram o pedido não disparam outra release.

O job mantém o ambiente protegido `desktop-release`, exige as chaves de assinatura existentes e executa testes Python/JavaScript, build do frontend e interoperabilidade Rust/Python. Antes de publicar, verifica pacote, assinatura criptográfica e feed HTTPS. Versões divergentes, confirmação incorreta ou falha de verificação bloqueiam a publicação. O arquivo de pedido contém somente metadados públicos; as chaves continuam nos secrets do GitHub.

## Execução manual

O mesmo workflow continua disponível por `workflow_dispatch` na main. O padrão manual `publish=false` gera um artefato assinado para teste. A publicação manual exige `publish=true` e a confirmação exata `PUBLICAR v<versão>`.

Não use tags para disparar a publicação: o ambiente de release autoriza a main. Não troque as chaves para cada versão, pois isso impediria as instalações existentes de validar a atualização.

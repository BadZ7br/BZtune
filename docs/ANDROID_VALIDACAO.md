# Validação Android

## Etapa 1 — versão 0.3.0

- GitHub Actions 41150380305 concluído com sucesso; APK de teste disponível.
- Compilação local e CI: minSdk 24, ARM de 32/64 bits, assinatura debug válida.
- Testes automatizados de fila, biblioteca SQLite em API 24 simulada e interface aprovados.
- Proprietário confirmou no chat: importação e reprodução com tela apagada funcionaram no A56.

A confirmação é um teste manual do proprietário, não uma medição automática neste ambiente.
Não foram informadas as versões de Android/WebView. Fones/Bluetooth, chamadas,
consumo prolongado de bateria e execução no J5 permanecem pendentes.

## Etapa 2 — assinatura fixa concluída

O bootstrap [41155109498](https://github.com/BadZ7br/BZtune/actions/runs/41155109498)
concluiu após o proprietário corrigir o acesso e as permissões do token temporário.
A chave permanece nos secrets do GitHub; nenhum valor privado foi incluído no código.
O token de configuração foi removido dos secrets; o PAT temporário pode ser revogado na conta.

O build [41155276446](https://github.com/BadZ7br/BZtune/actions/runs/41155276446)
concluiu com sucesso e publicou `BZtune-Android-7-teste-assinatura-estavel`.
O workflow verifica a assinatura e compara o certificado do APK com o SHA-256 configurado
antes do upload. Onze testes dos scripts e integração com assinatura real também passaram.
Guia de manutenção: [ANDROID_ASSINATURA.md](ANDROID_ASSINATURA.md).

Os APKs debug descartáveis antigos podem exigir uma reinstalação inicial. Builds futuros
com a mesma identidade e versão crescente permitem preservar os dados na atualização.
Isso não publica uma atualização Windows nem estabelece um canal Android de produção.

## Etapa 3 — backup Android 0.4.0

Implementados exportação JSON, prévia, cancelamento, confirmação explícita e restauração
transacional do catálogo e da fila, sempre pausada. Antes de substituir dados, o aplicativo
guarda uma cópia privada exportável. Migração SQLite 1→2 preserva o catálogo existente.
Um registro durável no banco permite concluir a recuperação da fila ao recriar o serviço.

Validação automatizada: 26 testes Kotlin (8 fila, 3 regras da biblioteca, 8 SQLite em
API 24 simulada e 7 formato/limites de backup); três suítes de navegador com ponte nativa
simulada. Incluem Unicode, versão incompatível, arquivo excessivo/UTF-8 inválido,
rollback SQL, reabertura do banco, prévia sem alteração, cancelamento e falha recuperável.

APK local compilado e verificado: versão 0.4.0, versionCode 4000, minSdk 24,
ARM de 32/64 bits e assinatura debug local válida (39,8 MiB). SHA-256:
`a2ff335f64afc94e53e4e7edb399501ec9d2ea91d0a319342fd8ef872ed499e0`.
A assinatura fixa é aplicada pelo GitHub; o hash desse APK será diferente.

Teste real do seletor de documentos, exportação/restauração, falta de espaço e interrupção
do serviço durante a restauração ainda precisa ser feito no aparelho. O backup não contém
áudio, capas nem permissões do Android. Reinstalar pode exigir selecionar os originais
novamente. Não usar esta versão como única cópia de dados importantes.

Após validar o backup no aparelho, a próxima etapa é organização: playlists, favoritos e coleção.

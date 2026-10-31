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
O [workflow 41208351728](https://github.com/BadZ7br/BZtune/actions/runs/41208351728)
concluiu com sucesso em 4m45s e publicou `BZtune-Android-7-teste-assinatura-estavel`
(arquivo de artefato de 16,1 MB). O CI conferiu o certificado fixo antes do upload.
O hash do APK do GitHub difere do build local por causa do ambiente e da assinatura.

Teste real do seletor de documentos, exportação/restauração, falta de espaço e interrupção
do serviço durante a restauração ainda precisa ser feito no aparelho. O backup não contém
áudio, capas nem permissões do Android. Reinstalar pode exigir selecionar os originais
novamente. Não usar esta versão como única cópia de dados importantes.

Após validar o backup no aparelho, a próxima etapa é organização: playlists, favoritos e coleção.

## Etapa 4 — favoritas locais 0.5.0

Implementados marcação/desmarcação por referência estável, filtro combinado com busca,
artista/álbum e paginação, persistência no SQLite e inclusão no backup formato 2.
Reimportação preserva favoritas. Migração SQLite 1/2→3 preserva catálogo e journal da fila.
Backups formato 1 da 0.4.0 continuam legíveis, sem favoritas; a confirmação explica isso.
São favoritas de músicas locais, não ainda favoritos de álbuns/coleção do desktop.

Validação: 32 testes Kotlin aprovados (8 fila, 3 regras, 12 SQLite em API 24 simulada,
9 backup). Casos novos incluem reimportação, reabertura, títulos iguais em arquivos
diferentes, paginação/filtros, ID removido, rollback e migração com recuperação pendente.
Três suítes de navegador aprovadas, com favoritos, rejeição de confirmação inválida,
filtro vazio, persistência após recarga e preservação da fila. Ponte nativa simulada;
a persistência real é validada separadamente pelos testes SQLite. Build desktop e
verificação de estrutura aprovados.

APK local 0.5.0 compilado e verificado: versionCode 5000, minSdk 24, ARM 32/64 bits,
assinatura debug local válida, 39,8 MiB. SHA-256:
`a003aedb58b9edacf0077a7f77c07e536e536d95a492fdbca826d03f196a2bfc`.
O [workflow 41210226872](https://github.com/BadZ7br/BZtune/actions/runs/41210226872)
concluiu com sucesso em 5m36s e publicou `BZtune-Android-7-teste-assinatura-estavel`
(artefato de 16,1 MB), após conferir o certificado fixo. O APK tem hash diferente do local.

Pendente no A56: atualizar sobre a identidade fixa anterior sem desinstalar, conferir
catálogo/fila, marcar/reimportar/reabrir e exportar/restaurar favoritas. O teste real do
backup 0.4.0 também continua pendente. Roteiro em mobile/README.md.

## Etapa 5 — playlists locais 0.6.0

42 testes Kotlin aprovados (32 anteriores e 10 de playlists). Incluem reabertura,
Unicode, nome inválido, deduplicação, ordem, revisão desatualizada, limites, remoção
em cascata, backup, migração 3→4 e rollback de restauração com falha SQL.
Quatro suítes de navegador aprovadas; nova suíte cobre criar, selecionar música,
reordenar, renomear, reabrir, tocar/adicionar, arquivo indisponível, conflito, resposta
inválida e exclusão cancelada/confirmada. Descoberto e corrigido erro que ocultava
mensagens de falha de edição ao recarregar os dados automaticamente.

APK local verificado: 0.6.0/versionCode 6000, minSdk 24, ARM 32/64, assinatura debug
local válida e 31,8 MiB. SHA-256:
`d7e89ed3cce7ab2eb0198bdbaa07f5841e4f2dfed7bf49a21e201f1a506f2bae`.
Build desktop e estrutura aprovados. Os testes de tela usam ponte simulada; ainda
faltam testes físicos de reprodução, permissões, interrupções e backup no A56.

## Etapa 6 — álbuns e coleção local 0.7.0

50 testes Kotlin aprovados: 8 fila, 3 regras, 12 SQLite/biblioteca, 10 playlists,
9 backup e 8 álbuns/coleção. Novos casos incluem edições e Unicode, artista do álbum,
marcas independentes de favoritas de faixas, reabertura e remoção das músicas,
paginação, conflitos, limite de 2.000 marcas, identidade/flags inválidos, backup
legado, rollback e migração 4→5 preservando playlists.
Cinco suítes de navegador aprovadas; nova suíte verifica escolhas independentes,
edições, persistência, links de música/artista, respostas inválidas/fora de ordem,
álbum sem arquivos, preservação da fila e largura de 320 px. Ponte simulada explicitamente.
Build desktop e verificação de estrutura aprovados.

APK local 0.7.0/versionCode 7000: minSdk 24, targetSdk 37, ARM 32/64, assinatura debug
válida e 31,9 MiB. SHA-256:
`eb0cc5e3f1aeedcf9aec65da04cb7c608c045acdad65a8e4b66607c6366d85fd`.
O [workflow 41212986657](https://github.com/BadZ7br/BZtune/actions/runs/41212986657)
concluiu com sucesso em 5m54s e publicou `BZtune-Android-7-teste-assinatura-estavel`
(16,2 MB no arquivo de artefato), após conferir o certificado fixo. O APK do GitHub
usa outra assinatura e tem hash diferente do build local.

Pendentes no A56: atualização preservando dados, playlists e coleção após reabrir,
reprodução e fila nativas, permissões revogadas, seletor de backup e restauração
completa. Não houve novo teste físico neste ambiente. A confirmação do proprietário
sobre importação/tela apagada aplica-se somente à 0.3.0, registrada acima.

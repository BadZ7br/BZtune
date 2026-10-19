# BZtune — Preparação do primeiro canal de atualização online

Status em 18/10/2026: **BZtune Desktop 2.0.3 instalado e validado pelo usuário**, incluindo
aviso de download temporário, player expandido fixo e rolagem independente da fila.

## Situação atual

A compilação Windows `2.0.3` já usa o endpoint de produção
`https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json`.
Porém, o repositório ainda não tem uma Release pública. Por isso, a consulta
pode falhar antes de a primeira versão ser publicada.

O painel agora trata de maneira compreensível:
- Manifesto indisponível ou inválido: informa que pode ser ausência da primeira
  Release **ou indisponibilidade do GitHub**; não diz falsamente que está atualizado.
- Falha de rede: orienta verificar conexão.
- Build sem assinatura: explica necessidade de compilação assinada.
- Erro de assinatura: alerta sobre a segurança sem exibir stack trace.
- Outros problemas: explica que não foi possível verificar e permite nova tentativa.

O programa não abre automaticamente a central em caso de erro no início.
O modo silencioso `quiet`, as assinaturas Tauri, o backend e as rotas permanecem intactos.

## Testes automatizados

O teste funcional `tests/desktop-updates.test.mjs` executa o próprio
`doomvault/public/desktop-updates.js` em Node.js, com uma simulação
isolada do DOM e das respostas da ponte Tauri. Não faz nenhuma requisição
à internet ou a um servidor privado. Cobre indisponibilidade da primeira
Release, offline, compilação não assinada, falha genérica, versão atual,
nova versão disponível, falha de assinatura durante a instalação e
checagem automática sem modal.

Esse teste roda nos três workflows:
`desktop-verify.yml`, `desktop-preview.yml` e `desktop-release.yml`.
Assim, a publicação também fica bloqueada se a experiência do atualizador regredir.

## Antes de publicar

1. Validar testes e build Windows desta alteração no PR.
2. Gerar um instalador assinado de teste (sugestão: `2.0.4`, `publish=false`).
3. Com backup, validar as mensagens em uma instalação Windows real.
4. Conferir biblioteca offline, playlists, backend, player e backups.
5. Selecionar explicitamente a **primeira versão estável pública**, com
   autorização separada. Não presumir publicação automática.
6. Publicar a primeira Release **somente mediante autorização explícita**,
   com `latest.json`, instalador `.exe` e assinatura `.sig`.
7. Para provar o upgrade online real, publicar mais tarde uma segunda
   versão maior, depois de testes e nova autorização.

Os builds assinados salvos como *Actions Artifacts* **não contam como
Releases públicas** e não fazem o endpoint `releases/latest` funcionar.

## Limitações

Nenhuma simulação DOM substitui uma atualização real no Windows. Os testes
RC3 → RC4 já comprovaram instalação silenciosa local, mas a primeira
transição online de produção só será demonstrada quando duas versões
estáveis assinadas existirem publicamente.

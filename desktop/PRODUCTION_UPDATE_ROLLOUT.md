# BZtune Desktop 2.0 — migração segura para atualizações online

## Estado atual

Atualização em 20/10/2026: o canal HTTPS respondeu com a versão pública **2.0.4**.
A execução completa com as correções locais ainda está pendente: não há Windows
disponível neste ambiente nem com o responsável neste momento. O roteiro e o
registro de aceitação estão em [HTTPS_UPDATE_ACCEPTANCE.md](HTTPS_UPDATE_ACCEPTANCE.md).
Escolher as versões base A e alvo B conforme o canal atual e os commits que
serão validados. O número da versão, sozinho, não identifica as correções presentes.

O teste assinado RC3 -> RC4 foi aprovado no Windows: o aplicativo detectou a
RC4 e instalou-a sem mostrar janela NSIS. **Esse teste usou
`http://127.0.0.1:8765/latest.json`**, que está embutido somente nos
instaladores de laboratório.

**A RC4 de laboratório não conseguirá se atualizar diretamente pelo
GitHub.** A URL de atualização está compilada no executável. A transição
para o canal de produção exige **uma única instalação manual** de um build
assinado com a URL HTTPS de produção. Depois dessa migração, as atualizações
posteriores usam a central integrada do BZtune.

## Endereço definitivo e arquivos publicados

- Manifesto: `https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json`
- Instalação Windows: `BZtune-Setup-v<versão>-x64.exe`
- Assinatura Tauri: `BZtune-Setup-v<versão>-x64.exe.sig`
- `latest.json` inclui `version`, `platforms.windows-x86_64.url` e
  `signature`. O instalador exige correspondência entre assinatura e
  artefato publicado.

O GitHub `releases/latest` serve a última **Release estável**, não draft
nem pré-release. Portanto, um build assinado salvo como **Actions Artifact**
não fornece atualizações online ao aplicativo. Artefatos de Actions servem
apenas para auditoria ou instalação de teste por desenvolvedores.

## Etapa A — Criar instalador de produção SEM publicar

1. Acesse **Actions > Desktop - Publicar instalador e atualizações**.
2. Clique **Run workflow** e selecione `main`.
3. Defina `version` como a versão base A escolhida para o teste, considerando
   o canal público atual e a futura versão alvo B. Marque **publish = false**.
   Deixe `release_confirmation` vazio.
4. Aguarde testes, build, assinatura e validação de artefatos ficarem verdes.
5. Baixe **BZtune-Signed-Test-<versão escolhida>** (retenção de 7 dias).
6. Confirme a presença dos arquivos `.exe`, `.sig` e `latest.json`,
   e que o JSON aponta para a URL HTTPS esperada.
7. Antes de instalar em sua máquina principal, crie um backup fora da
   instalação de `%LOCALAPPDATA%\BZtune\library` e dos seus outros dados
   do BZtune. Use preferencialmente perfil Windows isolado para testes.
8. Instale esse build uma vez. O **instalador inicial** ainda pode exibir
   o assistente. Não desinstale versões anteriores apagando dados.

A consulta depende do estado atual do canal e da comparação entre versões.
Um artefato de teste não publica a versão alvo no canal. O app mantém o modo
quiet para futuras atualizações. Não instalar uma atualização de código antigo
apenas porque seu número é maior que o do build local.

## Etapa B — Publicação, SOMENTE após aprovação explícita

*Um commit comum não publica uma Release. A publicação é solicitada pelo workflow manual ou pelo envio explícito de uma tag estável `v2.x.y`.*

Depois dos testes de instalação e da autorização explícita do responsável:

1. Acione o mesmo workflow em `main` com a versão alvo B escolhida.
2. Marque `publish = true` e digite **`PUBLICAR v<versão alvo B>`** em
   `release_confirmation`.
3. A pipeline validará a assinatura e o manifesto novamente, antes de
   criar a tag da versão B no GitHub Releases.
4. Verifique os três arquivos públicos do Release e o conteúdo do
   manifesto por HTTPS. A chave privada nunca é publicada.

Para provar uma **atualização online real**, B deve ser uma Release estável
maior que A e estar disponível no endpoint de produção. O aplicativo A deverá
encontrar B e instalá-la pela central. A mesma versão não oferece atualização
a si própria. A disponibilidade de `2.0.4` não comprova esse fluxo com as mudanças locais.

### Solicitação por tag estável

O workflow também aceita o envio explícito de uma tag estável `v2.x.y`.
Esse envio solicita **build assinado e publicação**, equivalente a `publish = true`.
Tags RC são rejeitadas e o commit da tag precisa estar integrado na `main`.
O job mantém o ambiente protegido `desktop-release`, seus secrets e eventuais
aprovações/restrições configuradas no GitHub. Se esse ambiente aceitar somente
branches, o responsável precisará permitir a tag de publicação nas regras do
ambiente ou usar o disparo manual em `main`; o workflow não remove essas regras.

Testes e verificação criptográfica continuam obrigatórios. Somente depois de
passarem o workflow publica instalador, assinatura e `latest.json`, marcando a
Release como a mais recente. Uma falha anterior impede disponibilizar a versão.
As publicações são serializadas para evitar execuções concorrentes.
A criação da tag ou o envio do código não comprova sucesso do build nem instalação.

## Etapa C — Checklist do primeiro upgrade online

- [ ] Na versão A, detectar automaticamente a versão B publicada.
- [ ] Mostrar notificação não intrusiva na central do BZtune.
- [ ] Abrir a central e clicar **Atualizar agora**.
- [ ] Exibir o progresso do download internamente.
- [ ] Validar a assinatura Tauri obrigatoriamente.
- [ ] Concluir a instalação **sem assistente NSIS**.
- [ ] Reabrir na versão B, sem perder biblioteca, playlists e preferências.
- [ ] Encerrar corretamente o backend ao fechar o BZtune.

## Proteções

- Chaves de assinatura ficam nos GitHub Secrets do ambiente `desktop-release`.
- Build comum ou `publish = false` não cria Release.
- `publish = true` só aceita versão estável e confirmação exata.
- O verificador de pacote compara `version`, nome, tamanho positivo,
  `.sig` e URL HTTPS esperada antes de qualquer publicação.
- O workflow também verifica as duas assinaturas Ed25519 do formato Minisign:
  conteúdo do instalador e comentário autenticado. Usa a chave pública esperada
  em `BZTUNE_UPDATER_PUBLIC_KEY` e exige que corresponda à configuração do build.
  Uma versão autenticada presente na assinatura deve corresponder ao manifesto;
  `requireSignedVersion`, quando ativado na configuração, exige esse campo.
- O verificador usa o Node.js já instalado no workflow, sem dependências npm
  adicionais nem chave privada. Falhas de assinatura, configuração ou execução
  do verificador bloqueiam tanto a publicação quanto o upload do artefato de teste.
- A verificação do Tauri no cliente permanece obrigatória e independente.
- Em falhas, preserve dados e backup. Não limpe `%LOCALAPPDATA%\BZtune`.
- O ambiente `desktop-release` deve ser protegido no GitHub com revisão
  obrigatória antes de executar publicações e acesso restrito à `main`,
  quando seu plano/permissões permitirem.

**Estado:** preparação de build e roteiro disponíveis. Aceitação de atualização
HTTPS completa com as correções atuais **pendente de execução em Windows**.
Gerar ou baixar um artefato não encerra essa validação.

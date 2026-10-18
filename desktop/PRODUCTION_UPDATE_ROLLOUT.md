# BZtune Desktop 2.0 — migração segura para atualizações online

## Estado atual

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
3. Defina `version` como `2.0.0`, marque **publish = false**.
   Deixe `release_confirmation` vazio.
4. Aguarde testes, build, assinatura e validação de artefatos ficarem verdes.
5. Baixe **BZtune-Signed-Test-2.0.0** (retenção de 7 dias).
6. Confirme a presença dos arquivos `.exe`, `.sig` e `latest.json`,
   e que o JSON aponta para a URL HTTPS esperada.
7. Antes de instalar em sua máquina principal, crie um backup fora da
   instalação de `%LOCALAPPDATA%\BZtune\library` e dos seus outros dados
   do BZtune. Use preferencialmente perfil Windows isolado para testes.
8. Instale esse build uma vez. O **instalador inicial** ainda pode exibir
   o assistente. Não desinstale versões anteriores apagando dados.

Como ainda não existe Release pública, esse build poderá mostrar que não
conseguiu consultar atualizações. Isso é esperado e não altera os dados.
O app mantém o modo quiet para futuras atualizações.

## Etapa B — Publicação, SOMENTE após aprovação explícita

*Este projeto não publica nada automaticamente a partir de um commit.*

Depois dos testes de instalação e da autorização explícita do responsável:

1. Acione o mesmo workflow em `main` com `version = 2.0.0`.
2. Marque `publish = true` e digite **`PUBLICAR v2.0.0`** em
   `release_confirmation`.
3. A pipeline validará a assinatura e o manifesto novamente, antes de
   criar `v2.0.0` no GitHub Releases.
4. Verifique os três arquivos públicos do Release e o conteúdo do
   manifesto por HTTPS. A chave privada nunca é publicada.

Para provar uma **atualização online real**, futuramente deve existir uma
segunda Release estável maior, como `2.0.1`. Um BZtune `2.0.0`
encontrará a `2.0.1` ao iniciar e poderá instalar dentro do programa.
A versão `2.0.0` não oferece atualização a si mesma.

## Etapa C — Checklist do primeiro upgrade online

- [ ] Na versão `2.0.0`, detectar automaticamente a `2.0.1` publicada.
- [ ] Mostrar notificação não intrusiva na central do BZtune.
- [ ] Abrir a central e clicar **Atualizar agora**.
- [ ] Exibir o progresso do download internamente.
- [ ] Validar a assinatura Tauri obrigatoriamente.
- [ ] Concluir a instalação **sem assistente NSIS**.
- [ ] Reabrir na versão `2.0.1`, sem perder biblioteca, playlists e preferências.
- [ ] Encerrar corretamente o backend ao fechar o BZtune.

## Proteções

- Chaves de assinatura ficam nos GitHub Secrets do ambiente `desktop-release`.
- Build comum ou `publish = false` não cria Release.
- `publish = true` só aceita versão estável e confirmação exata.
- O verificador de pacote compara `version`, nome, tamanho positivo,
  `.sig` e URL HTTPS esperada antes de qualquer publicação.
- A validação criptográfica da assinatura é feita pelo Tauri no cliente;
  a checagem do workflow **não substitui** essa validação.
- Em falhas, preserve dados e backup. Não limpe `%LOCALAPPDATA%\BZtune`.
- O ambiente `desktop-release` deve ser protegido no GitHub com revisão
  obrigatória antes de executar publicações e acesso restrito à `main`,
  quando seu plano/permissões permitirem.

**Estado:** pronto para *dry-run* do build de produção; nenhuma versão
estável precisa ser publicada para cumprir esta etapa.

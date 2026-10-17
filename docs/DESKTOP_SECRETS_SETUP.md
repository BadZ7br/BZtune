# BZtune Desktop — ativar publicação assinada (passo a passo)

**Estado:** a distribuição pública está desativada até aprovação dos testes e cadastro das chaves. **Nunca envie a chave privada em chats, commits, issues ou anexos.**

## 1. Chave de assinatura de atualizações Tauri

No computador do proprietário, em uma pasta privada, execute:

```powershell
cd desktop
npm install
npm run tauri -- signer generate -w "$env:USERPROFILE\.tauri\bztune-updater.key"
```

Guarde um backup seguro do arquivo privado gerado. O arquivo `.pub` é público; o outro arquivo não é.

## 2. Permissão mínima para publicar no repositório público

Criar um **fine-grained personal access token** com acesso **somente** ao repositório `BadZ7br/BZtune-Releases` e permissão **Contents: Read and write**. Não usar tokens com acesso a todos os repositórios.

## 3. Cadastrar secrets no repositório privado

Em `BadZ7br/BZtune` → **Settings → Environments**, criar o ambiente `desktop-release`. Se o plano permitir, adicionar revisão/aprovação obrigatória.

Cadastrar no ambiente (ou em Actions Secrets se necessário):

- `TAURI_SIGNING_PRIVATE_KEY`: conteúdo do arquivo privado Tauri (não enviar a ninguém).
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: senha usada ao gerar a chave, quando configurada.
- `BZTUNE_UPDATER_PUBLIC_KEY`: conteúdo integral do arquivo público `.pub`.
- `BZTUNE_RELEASES_TOKEN`: token limitado ao repositório público.

Nenhum desses secrets deve aparecer no código-fonte. A chave pública é inofensiva, mas o pipeline a injeta apenas durante o release.

## 4. Testar instalador de prévia

Em **Actions → Desktop Windows - Gerar instalador de teste**, baixe o artifact `BZtune-Desktop-Windows-Preview` da execução bem-sucedida.

Essa prévia **não é uma distribuição oficial**: atualização interna desativada e Windows SmartScreen pode avisar porque o executável não possui certificado Authenticode.

Verifique Windows limpo, abertura por dois cliques, bibliotecas sem Python instalado, streaming que o serviço permita, playlists, músicas offline, backup, encerramento do backend e porta local.

## 5. Publicar primeira versão assinada

Após validação real, em Actions selecione **Desktop - Publicar instalador e atualizações**, escolha a branch `feature/desktop-v2` e a versão **estável** `2.0.0` (não prerelease). O pipeline testa o app, gera NSIS, exige o .sig e publica no `BZtune-Releases` público um instalador assinado e `latest.json`.

A versão distribuída terá o botão interno **Atualizações**. A verificação compara versões e a instalação só é iniciada com a confirmação do usuário. As chaves do updater verificam autenticidade do pacote; **não substituem a assinatura Authenticode do Windows**, que exige certificado separado caso se deseje evitar alertas de reputação do SmartScreen.

## 6. Validar atualização entre versões

Para testar o atualizador de verdade, precisamos de duas versões assinadas com a MESMA chave: instalar a primeira, publicar a segunda e usar o botão interno. Confira que SQLite, músicas e playlists permaneceram. Só então marque o Desktop como estável.

**Não publique release enquanto faltar qualquer teste de integridade ou de retenção de dados.**

# BZtune RC3 -> RC4 | Teste de atualização silenciosa no Windows

Objetivo: validar o updater Tauri com o instalador do Windows **sem janela NSIS** durante a atualização. Este é um teste local assinado; **não publica GitHub Release**.

## Precauções

- Faça backup da biblioteca e dos dados em local externo. Em especial, preserve `%LOCALAPPDATA%\BZtune\library`.
- Preferencialmente use um perfil de usuário Windows de testes e músicas de teste.
- Pare o servidor local anterior da RC2 (Ctrl+C); só um programa pode usar a porta `8765`.
- **A RC1/RC2 antiga não permite testar o modo quiet**. O comportamento é definido pelo **cliente instalado antes da atualização**.
- O assistente do Windows **pode aparecer ao instalar a RC3 pela primeira vez**. O que estamos testando é o upgrade **RC3 -> RC4**, não a instalação inicial.

## Passos

1. No Actions, execute manualmente o workflow **Desktop - Teste local updater RC3 para RC4 (sem Release)** na branch `main`. Aguarde todos os jobs ficarem verdes.
2. Em **Artifacts**, baixe **BZtune-Updater-Local-RC3-to-RC4** e extraia com as subpastas.
3. Na pasta `rc3-client`, execute **BZtune-Setup-v2.0.0-rc.3-x64.exe** para instalar a versão de teste.
4. Feche outras instâncias do BZtune, se existirem. Na pasta extraída que contém `serve_update_test.ps1`, abra um terminal PowerShell e execute:
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\serve_update_test.ps1`
   Deixe esse terminal aberto. O script valida que o feed é da RC4, compara assinatura e URL e só atende a `127.0.0.1:8765`.
5. No navegador, visite `http://127.0.0.1:8765/latest.json`; confira `"version": "2.0.0-rc.4"`.
6. Abra a **RC3** e observe: após aproximadamente 3 segundos, o BZtune procura atualizações de forma discreta. O botão **Atualizações** deve indicar `2.0.0-rc.4` sem mostrar confirmação do Windows.
7. Abra a central, clique em **Atualizar agora**. O **download** deve ter sua barra de progresso dentro do BZtune. Depois, o aplicativo pode fechar por um momento para substituir os executáveis; isso é normal.
8. **Não deve aparecer a janela do assistente NSIS durante RC3 -> RC4**. Espere o BZtune reabrir automaticamente, sem clicar em instalador.
9. Confirme a versão instalada `2.0.0-rc.4`, teste músicas, playlists, backup, Descoberta e Estatísticas. Feche o BZtune e confirme o encerramento do backend.
10. Encerre o PowerShell com `Ctrl+C` depois de concluir.

## Conteúdo esperado do ZIP

```text
rc3-client/
  BZtune-Setup-v2.0.0-rc.3-x64.exe
  BZtune-Setup-v2.0.0-rc.3-x64.exe.sig
update-server/
  BZtune-Setup-v2.0.0-rc.4-x64.exe
  BZtune-Setup-v2.0.0-rc.4-x64.exe.sig
  latest.json
serve_update_test.ps1
LEIA-ME.md
```

## Resultado aceito

- RC3 detecta RC4 sozinha.
- Progresso aparece na própria central do BZtune.
- Atualização é autenticada pela assinatura Tauri.
- O assistente NSIS **não aparece durante a atualização RC3 -> RC4**.
- RC4 abre normalmente e os dados do usuário são preservados.

Se houver erro, não apague `%LOCALAPPDATA%\BZtune`. Envie a mensagem e um print da central; preserve o backup. Não execute a RC4 manualmente para contornar um erro do atualizador.

## Limitações intencionais

Este teste usa HTTP **somente em loopback** e tem dependência do servidor local. O updater público continuará HTTPS, com `latest.json` em GitHub Releases. Este ZIP é exclusivamente de teste, com retenção de 7 dias. A chave privada não é incluída.

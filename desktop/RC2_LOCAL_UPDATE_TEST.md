# BZtune 2.0.0 RC1 -> RC2: teste de atualização local e assinado

Este pacote testa o mecanismo real de atualização do Tauri **sem publicar nenhuma GitHub Release**.
Não é um instalador estável. Use somente no seu computador de desenvolvimento, com
um backup da biblioteca fora da pasta do BZtune.

## Importante: RC1 instalada anteriormente não é esta RC1 de teste

A RC1 anterior foi compilada para buscar `https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json`.
Como não publicaremos nenhuma Release, ela não encontrará o feed local.
Instale **a RC1 da pasta `rc1-client` deste novo artefato**, compilada com o
endereço de teste `http://127.0.0.1:8765/latest.json`. O instalador RC2
será instalado pelo atualizador, sem executá-lo manualmente.

## Como testar no Windows

1. Faça backup da pasta de dados e da biblioteca, especialmente
   `%LOCALAPPDATA%\BZtune\library`. Não apague a instalação original nem
   sua biblioteca. Preferencialmente use uma conta/perfil Windows de testes.
2. No GitHub Actions, baixe o artefato **BZtune-Updater-Local-RC1-to-RC2**
   da execução verde do workflow **Desktop - Teste local updater RC1 para RC2 (sem Release)**.
3. Extraia o ZIP **com as pastas preservadas**.
4. Instale `rc1-client\BZtune-Setup-v2.0.0-rc.1-x64.exe`.
   Esta RC1 é assinada para atualizações com a mesma chave Tauri da RC2.
5. Abra o PowerShell na pasta extraída (onde está `serve_update_test.ps1`) e execute:
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\serve_update_test.ps1`
   O script lê apenas os arquivos locais do pacote e atende SOMENTE em `127.0.0.1:8765`.
   Se o Windows já permitir execução de scripts, também pode usar:
   `.\serve_update_test.ps1`.
6. **Deixe essa janela do servidor aberta.** Abra o BZtune RC1 de teste,
   acesse **Atualizações > Buscar atualizações**.
7. Confira se a RC2 é detectada; clique **Instalar atualização** e acompanhe
   o progresso. O Tauri deve verificar a assinatura, executar o instalador
   em modo de atualização e reiniciar no final.
8. Confirme que o aplicativo informa `2.0.0-rc.2`, abre sem erros,
   preserva biblioteca, configurações e playlists, reproduz áudio
   e encerra o backend ao fechar.
9. Encerre o servidor local pressionando `Ctrl+C` no PowerShell.

A assinatura `.sig` é verificada pelo Tauri durante o download.
O servidor rejeita caminhos fora dos arquivos explicitamente permitidos
e só usa a interface de loopback; **nenhuma chave privada é incluída no pacote**.
A exceção de transporte HTTP existe apenas nos builds RC locais,
não no fluxo de Release oficial HTTPS.

## O que esta execução faz (e NÃO faz)

- Compila e assina `2.0.0-rc.1` de teste e `2.0.0-rc.2` com a mesma chave
  protegida no ambiente `desktop-release` do Actions.
- Empacota os instaladores, `.sig`, `latest.json`, script do servidor e este guia.
- **NÃO** usa `gh release create`, **NÃO** cria tag, **NÃO** faz push
  para o repositório e **NÃO** publica versão estável nem pré-release.
- Os binários permanecem nos Artifacts do Actions por apenas 7 dias.
- A RC2 gerada também aponta para o servidor local: não a distribua como Release final.

## Se algo não funcionar

- `Nao foi possivel conectar`: servidor não está aberto ou a porta
  `8765` está ocupada.
- `Nenhuma atualização`: confirme que foi instalada a RC1 da pasta
  `rc1-client`, não a RC1 antiga.
- `Assinatura invalida`: não edite o `.exe`, `.sig` ou o feed JSON;
  baixe novamente o artefato.
- `Porta 5000 ocupada`: encerre apenas uma instância do BZtune iniciada
  por você e verifique se há outro serviço utilizando a porta.
- Falha na atualização: preserve o backup e os logs; **não limpe**
  `%LOCALAPPDATA%\BZtune` como tentativa de correção.

**Aceite do teste:** RC1 de teste detecta RC2, download e assinatura aprovados,
instalação executada pela interface, reinicialização, dados intactos e encerramento
adequado do backend. Só após isso planejaremos o Release estável.

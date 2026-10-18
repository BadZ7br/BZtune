# BZtune Desktop v2.0 — checklist da prévia Windows

> Prévia de teste. Não equivale a um Release assinado para distribuição. A prévia **não pode instalar atualizações automáticas**, porque `createUpdaterArtifacts` e a chave pública real só são ativados no workflow de Release.

## Origem e segurança

- A prévia deve vir somente do artefato `BZtune-Desktop-Windows-Preview` da execução **Desktop Windows - Gerar instalador de teste** em `feature/desktop-v2`, com status verde.
- Verificar se o SHA da branch no artefato corresponde ao commit atual. Não usar o binário de uma execução anterior a um merge.
- É um instalador de prévia possivelmente não assinado com certificado Authenticode; não distribuir como versão estável.
- Guardar um backup da biblioteca **fora** do repositório antes de executar a prévia. Não desinstalar versões antigas nem limpar `%LOCALAPPDATA%/BZtune`.
- Preferir um perfil Windows de teste/ambiente isolado; não testar sobre o único acervo de músicas.

## Regressão da origem Tauri — prévia corrigida

- A versão experimental anterior podia mostrar `Origem não autorizada` em Descoberta, `API de estatísticas indisponível` e `API indisponível` em Backup.
- A API `bztune_features` agora permite `http://tauri.localhost`, `https://tauri.localhost` e `tauri://localhost` **somente** em `BZTUNE_DESKTOP_MODE=1`.
- Sites externos, origens semelhantes ou `null` permanecem bloqueados; o backend só escuta `127.0.0.1`.
- Antes de dar como corrigido, abrir Descoberta, Estatísticas e Backup **no instalador recompilado após a correção**. Verificar funcionamento real, não apenas a ausência da mensagem.
- Testes automatizados: `python -m unittest tests.test_desktop_origin -v`.
- Se alguma aba continuar indisponível, registrar o status HTTP da requisição e a origem vista pela WebView; não desativar a checagem de segurança.

## Instalação e funcionalidade

- [ ] Instalar pelo `.exe` sem utilizar terminal, Node.js, Python nem Rust durante a execução.
- [ ] Abrir BZtune pelo menu Iniciar/atalho; confirmar a janela e a inicialização do backend local.
- [ ] Confirmar que a porta `127.0.0.1:5000` está livre antes do início, ou que o app apresenta erro compreensível se estiver ocupada.
- [ ] Abrir catálogo e páginas de artistas/álbuns, com resultados e capas quando a fonte online permitir.
- [ ] Verificar busca, playlist, fila, controles de reprodução, shuffle/repeat, mini-player e histórico.
- [ ] Verificar áudio offline por arquivo próprio de teste e edição de metadados, sem alterar o acervo original.
- [ ] Verificar que fechar o aplicativo encerra o backend iniciado por ele (sem encerrar processos que já existiam).
- [ ] Reabrir e confirmar preservação de biblioteca, metadados, playlists, capas e configurações.
- [ ] Abrir a janela de **Atualizações**. A prévia deve comunicar que somente uma versão assinada poderá buscar/instalar releases, sem falhar ou instalar algo.
- [ ] Testar o botão de fechar, minimizar e reabrir o programa.
- [ ] Confirmar que não há caminhos de desenvolvimento absolutos exigidos para iniciar o app.

## Antes de um Release estável

- [ ] Revisar o PR Desktop e aprovar CI após integração com `main`.
- [ ] Criar chave Tauri Updater **fora** do repositório e proteger sua senha.
- [ ] Configurar `desktop-release` e os secrets `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` e `BZTUNE_UPDATER_PUBLIC_KEY`.
- [ ] Confirmar que `prepare_signing.py` ativa `createUpdaterArtifacts: true` e substitui a chave pública placeholder só no runner.
- [ ] Validar assinatura real `*-setup.exe.sig` e conteúdo do `latest.json`, incluindo URL exata do arquivo assinado.
- [ ] Instalar duas versões sucessivas assinadas com a **mesma** chave, testar `Buscar atualizações` e `Instalar` pela interface.
- [ ] Conferir a persistência de SQLite, áudios, capas e playlists após upgrade, sem perda ou sobrescrita.
- [ ] Publicar em `BadZ7br/BZtune/releases`, com autorização explícita e backup seguro. Apenas depois considerar a exclusão de `BZtune-Releases`.

**Em caso de falha**: guardar a etapa que falhou, a mensagem e o log da execução do GitHub Actions. Não modificar a pasta de dados do usuário nem executar limpeza destrutiva para contornar erros.

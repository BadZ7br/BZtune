BZtune 2.0.12 — diagnóstico guiado e relatórios para o GitHub.

- Nova opção em Backup e diagnóstico, com modos rápido e aprofundado, cancelamento e resultados individuais.
- Verifica serviço local, contratos de biblioteca/playlists/histórico, SQLite, dependências, preferências e fila salva.
- O modo aprofundado confere contato com LRCLIB, YouTube Music e GitHub, amostra de até 100 arquivos, FFmpeg/FFprobe, espaço e gravação temporária.
- Mostra alterações pendentes, configuração do atualizador e códigos técnicos de falhas recentes, sem coletar músicas, caminhos pessoais ou tokens.
- Permite comparar verificações na sessão, baixar relatório e abrir uma issue preenchida para revisão e publicação pela conta do usuário.
- Informa claramente áreas não testadas. Não executa reparos, restauração, downloads completos ou testes de reprodução na biblioteca real.
- Mantém o sistema de letras sem alterações funcionais nesta versão.

Validação local: 230 testes Python aprovados (1 exclusivo de Windows ignorado), 125 testes JavaScript e 31 suítes de navegador aprovadas; build TypeScript/Vite e estrutura aprovados. O workflow Windows exige testes, compilação, assinatura e validação do pacote antes de publicar. A abertura do navegador padrão e a atualização real precisam de aceitação no Windows.

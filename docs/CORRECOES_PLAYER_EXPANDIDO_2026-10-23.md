# Correções do player expandido — 23/10/2026

Os itens PE-01 a PE-08 da auditoria foram tratados um por vez, com testes específicos antes de avançar. As alterações estão no código do workspace; não foi publicado instalador ou atualização nesta etapa.

| Item | Correção | Validação específica |
| --- | --- | --- |
| PE-01 | O contêiner de mídia acompanha a altura das alternativas e deixa os controles fora da área do painel. Rodapé preservado. | Recuperação online com cliques reais e verificação de todos os alvos em 8 combinações de janela, fonte e tela aberta. O teste falhava antes da correção. |
| PE-02 | Trabalhos de download pertencem à sessão do aplicativo, identificados por gravação/álbum. Continuam sendo consultados após troca de faixa ou desmontagem do botão. Pedidos repetidos em andamento são bloqueados; respostas tardias continuam ligadas à faixa original. | Testes de gerenciador e navegador: troca de faixa, resposta inicial atrasada e fechamento do player; atualização da biblioteca emitida ao concluir, uma única vez. |
| PE-03 | A fonte fica estável durante a ativação atual da faixa. Baixar a gravação não troca a reprodução online por local no meio da audição. A próxima ativação pode preferir a cópia local confirmada. | Biblioteca muda de verdade no fixture; posição online em 65 segundos e estado de pausa/reprodução são preservados. Voltar à faixa passa a usar WAV local real. Testes existentes de seek, repetição e crossfade também passaram. |
| PE-04 | Respostas de alternativas e downloads são validadas antes de entrar no estado. Envelope, IDs, membros, textos e contagens inválidos geram aviso recuperável. Busca de alternativas é cancelada ao desmontar/trocar a identidade. | Respostas inválidas injetadas; o player permanece montado. Nova busca/consulta válida recupera o painel. Testes unitários cobrem identidades, status, totais e campos aninhados. |
| PE-05 | Histórico recupera entradas válidas de forma limitada e sem duplicatas; equalizador aceita somente três ganhos seguros e recupera bandas inválidas. | JSON inválido, `null`, objetos indevidos e registros mistos não derrubam o player nem apagam sua fila. |
| PE-06 | Escape fecha primeiro os seletores de playlist/fila visíveis. Fechamento devolve foco ao acionador; fechar uma ferramenta/fila devolve foco ao item do rodapé. | Navegador com playlists locais e online, fechamento por botão e teclado, seleção da biblioteca e minimização sem seletor aberto. |
| PE-07 | A rota de download exige objeto JSON, artista/título textuais não vazios com limites e identificadores opcionais válidos. Dados inválidos retornam 400 antes de criar lotes/threads. | Flask real isolado, sem workers externos: entradas inválidas rejeitadas; pedidos válidos de faixa/álbum e limite de 3 lotes ativos preservados. |
| PE-08 | Fechar continua encerrando a reprodução e limpando a fila, mas o nome acessível/tooltip explica a consequência. Aviso oferece Desfazer ou dispensar. | Desfazer restaura ordem, índice e modos da fila, pausada e sem autoplay; foco volta ao botão Expandir. Uma fila nova não pode ser substituída pela restauração antiga. |

O desenho, a ordem e os itens do rodapé foram mantidos. O aviso de Desfazer aparece após encerrar o player; pode ser dispensado e deixa de ser oferecido ao iniciar uma nova fila. A restauração é da fila, não uma promessa de retomar a posição exata anterior ao fechamento.

Os trabalhos de download sobrevivem à navegação dentro da sessão. Não foi implementada retomada de downloads após encerrar o aplicativo/processo. O backend permanece responsável pelos arquivos e pela proteção contra duplicação.

Os testes novos de navegador foram incluídos na verificação de release do GitHub. Isso configura a proteção para a próxima execução do workflow; não significa que uma execução no Windows/GitHub já ocorreu nesta etapa.

As melhorias opcionais do relatório original — ações no Histórico, indicação/bypass do equalizador, resolução automática de álbuns e organização maior dos componentes — não fazem parte dos oito defeitos priorizados.

## Verificação final

- Build TypeScript/Vite aprovado.
- Verificações de release: 203 casos Python executados, sendo 202 aprovados e 1 exclusivo de Windows ignorado; 113 casos JavaScript aprovados.
- As 16 suítes de navegador passaram: os 10 grupos anteriores e 6 novos grupos específicos para essas correções. O fluxo de fechar/desfazer também foi validado nos temas escuro/claro, em 1360 e 320 px, com áudio online simulado e WAV local real.
- APIs de provedores e ponte Tauri/WebView2 usam adaptações/mocks nos testes de navegador. Áudio WAV local é real no Chromium. Não foi executado aplicativo instalado no Windows nem publicada atualização.

## Comandos

```text
npm --prefix doomvault run build
python desktop/scripts/run_release_checks.py
```

Os testes de navegador precisam de Playwright/Chromium, frontend servido em `http://127.0.0.1:5173` e são os mesmos listados no workflow `.github/workflows/desktop-release.yml`. Em Linux, `CHROMIUM_PATH` pode indicar o Chromium do sistema. As APIs são interceptadas e os dados são sintéticos; os testes Python de validação não iniciam downloads externos.

[Logs e capturas da verificação](audits/player-correcoes-2026-10-23/README.md).

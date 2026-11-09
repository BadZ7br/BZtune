# Melhorias desktop — execução sequencial (08/11/2026)

Referência: lista M01–M15 apresentada após a auditoria do desktop. Nenhuma atualização foi publicada e nenhum instalador pessoal foi modificado.

| Item | Entrega e estado |
| --- | --- |
| M01 — carregadores dos testes | Corrigidos os três carregadores afetados pelo parser compartilhado; asserções preservadas. |
| M02 — URLs de capa | Formatos inválidos retornam 400 antes da rede; dois testes de regressão cobrem as restrições. |
| M03 — código sem uso | Removidos 13 nomes sem uso e duas regras CSS exatamente repetidas. |
| M04 — rotas de artistas | Removidos corpos substituídos; rotas delegam explicitamente à implementação efetiva. Três testes HTTP verificam identidade, deduplicação e rejeição de entrada vazia. |
| M05 — CSS legado | Retiradas 63 regras de classes antigas confirmadas. As 31 suítes de navegador passaram nesta etapa. Outros candidatos continuam exigindo análise individual. |
| M06 — elementos ocultos | Removidos footer antigo de mídia, prévias e cartão de álbum sempre ocultos nos layouts atuais; fila e motor de áudio preservados. |
| M07 — capas | `ArtworkImage` concentra erro/carregamento em capas gerais, busca, artista e fila. Contêineres, placeholders e textos alternativos preservados. Uma URL diferente permite nova tentativa; rerender da mesma URL não repete a falha. |
| M08 — API/diagnóstico | Endereço centralizado no desktop; `observedFetch` registra status/erro de transporte em chamadas antes não observadas, sem introduzir um segundo prazo. Removida validação duplicada da lista de playlists. Três testes novos cobrem privacidade dos códigos, cancelamento e prazo excedido. |
| M09 — Vite | Lockfile atualizado deliberadamente para 6.4.5, sem `audit fix --force`; npm audit informa zero vulnerabilidades nesta execução. |
| M10 — modularização do player | Primeira separação: carregamento, promise compartilhada, cleanup e erros YouTube em `player/youtube-api.ts`. Estado/efeitos de reprodução continuam no componente, evitando uma reescrita simultânea. Extrações adicionais de estado/letras ficam para etapas próprias. |
| M11 — organização CSS | Mapa de responsabilidades e guia de manutenção adicionados, sem alterar ordem da cascata. Não houve separação física em arquivos nem reordenação de todos os overrides. |
| M12 — restauração longa | Implementados journal recuperável, lock entre processos, exclusão de operações nativas concorrentes e supervisor com prazo/confirmacão de término. Testes de processos interrompidos aprovados. Ver RESTAURACAO_TRANSACIONAL_DESKTOP.md; aceite físico ainda pendente. |
| M13 — regressão visual | Quatro PNGs de referência: Início em três temas e Biblioteca. Comparação automática passou; alteração visual intencional em cópia temporária foi detectada e rejeitada. Cobertura inicial, sem gate Windows. |
| M14 — integração | Testes das rotas Flask efetivas adicionados; ponte Python ↔ Rust executada contra SQLite real temporário, cobrindo CRUD, lote, duplicação, reordenação e preservação de áudio. Não equivale a E2E completo do Windows instalado. |
| M15 — aceite Windows | Roteiro detalhado preparado em DESKTOP_WINDOWS_ACEITE.md. Execução em Windows, áudio físico e atualização real permanecem pendentes. |

## Precisões sobre a auditoria anterior

M01 envolveu **três** carregadores: letras, exportação de backup e recuperação do frontend. A auditoria destacou dois; a execução após corrigi-los revelou seis falhas restantes no terceiro. Os 125 casos antigos passam após as três correções. A suíte JavaScript passou a 128 casos com os novos testes de observação HTTP.

A numeração usada em duas mensagens de progresso associou a remoção da validação repetida a M09 e Vite a M11. Esta tabela segue a lista original: Vite é M09, organização CSS é M11, validação repetida acompanha M08.

## Limites

Ainda não há comprovação de funcionamento de todas as funções em Windows. Suítes de navegador simulam provedores; algumas usam áudio WAV real no Chromium. Referências visuais dependem de sistema, fontes e versão do navegador. A recuperação transacional foi implementada em uma etapa posterior, com reprodução de interrupções e confirmação do encerramento; a validação física no Windows continua pendente. Nada foi publicado nesta execução.

## Verificação final

Rodada final concluída: build, estrutura e Ruff selecionado aprovados; Python 247 casos, sem falhas, um ignorado; JavaScript 128/128; 31 suítes de navegador; oito testes Rust; quatro comparações PNG aprovadas. Controle negativo visual detectou e rejeitou alteração proposital numa cópia temporária. Ponte Python ↔ Rust aprovada e npm audit sem vulnerabilidades relatadas.

Evidências em [audits/desktop-melhorias-2026-11-08](audits/desktop-melhorias-2026-11-08/). Não confundir os resultados intermediários da auditoria com o código após estas correções. Não há validação física Windows nem nova publicação.


## Etapa seguinte — restauração transacional

M12 implementado e validado em processos temporários Linux/Windows: journal, lock entre processos, exclusão de acesso nativo concorrente, supervisor com prazo e confirmação de término, recuperação antes da criação da biblioteca e preservação de backups anteriores. Caminhos abreviados Windows normalizados após falha detectada em execução intermediária.

[Protocolo, evidências e instalador de teste](RESTAURACAO_TRANSACIONAL_DESKTOP.md). Workflow final 42541374112, commit 2e160e3: sucesso. Suíte local: 256 Python (um ignorado, sem falhas), 128 JavaScript. Instalador Preview separado pronto; M15 permanece pendente de aceite físico. Nenhuma atualização pública foi lançada.

# Conclusão das correções F01 a F10 — 23/10/2026

Os dez itens da auditoria de frontend foram conferidos. F01, F02 e F03 já tinham implementação; seus testes foram repetidos e passaram. F04 a F10 foram concluídos nesta etapa, um de cada vez, preservando as correções do player expandido e o rodapé aprovado.

As alterações estão no workspace. O workflow de release foi atualizado para executar os novos testes; isso não significa que uma publicação ou execução Windows no GitHub já tenha ocorrido.

| Item | Situação | Comportamento final |
| --- | --- | --- |
| F01 | Revalidado | Respostas inválidas ficam na área afetada, com recuperação local e preservação dos dados válidos. Falhas de módulos ocultos não substituem o aplicativo inteiro. |
| F02 | Revalidado | Leituras e alterações de playlists possuem prazo e recuperação. Alterações de resultado incerto não são repetidas automaticamente, inclusive na ponte nativa. |
| F03 | Revalidado | O JSON exportado usa o estado atual, inclui alterações pendentes da sessão e compartilha a validação da restauração. Itens incompatíveis ficam identificados separadamente. |
| F04 | Corrigido | A Descoberta cancela operações anteriores e confere a identidade da consulta antes de aplicar dados, erros ou fim do carregamento. Rádio, perfis, mudança de modo e abertura de álbuns usam essa proteção. |
| F05 | Corrigido | Editores e player expandido recebem foco inicial, contêm Tab/Shift+Tab e deixam o fundo inerte. Escape respeita seletores internos; fechar devolve o foco ao acionador. O menu móvel fechado deixa de receber foco. |
| F06 | Corrigido | As áreas são inicializadas ao primeiro acesso. A biblioteca renderiza até 50 músicas por página nas visualizações de álbuns, artistas e faixas, e nenhuma linha quando oculta. Pesquisa, ordenação, página e seleção são mantidas. Reproduzir continua usando a fila completa. |
| F07 | Corrigido | Recomendações distinguem falha total, falha parcial e ausência legítima de resultados. Exclusão do histórico e cópia do resumo tratam rejeições e mostram confirmação somente após sucesso. |
| F08 | Corrigido | Favoritos e Coleção deduplicam por ID, preservando edições distintas com mesmo nome. A comparação de nomes preserva Unicode, incluindo nomes japoneses, sem apagar seus caracteres. |
| F09 | Corrigido | Textos secundários que falhavam ganharam contraste apropriado ao tema. Descoberta usa grupo de botões com seleção acessível; vídeo e outros grupos têm papéis adequados. Nomes acessíveis acompanham o texto visível dos botões. |
| F10 | Corrigido | Miniaturas da fila e dos previews compartilham fallback por erro de carregamento. URLs com falha não são solicitadas novamente por simples atualização do player; capas válidas continuam aparecendo. |

## Verificação

- Build TypeScript/Vite aprovado e `git diff --check` sem erros.
- 203 testes Python executados: 202 aprovados e 1 exclusivo de Windows ignorado.
- 115 testes JavaScript aprovados.
- 23 suítes de navegador aprovadas, incluindo as regressões anteriores de letras, playlists, backup e player.
- A suíte de acessibilidade executou axe-core 4.14.0 em 20 cenários: 12 abas no tema escuro, variações meia-noite/claro, player expandido em diferentes larguras e editor de metadados. Nenhuma violação das regras WCAG 2 A/AA e 2.1 A/AA executadas foi detectada nesses cenários.
- Com 1.500 músicas: até 50 linhas por página nas três visualizações, zero linhas da biblioteca na Home/aba oculta, última faixa encontrável, seleção e página preservadas após navegar e fila de 1.500 músicas ao reproduzir.
- Favoritos/Coleção: quatro IDs, incluindo duas edições de mesmo título/artista e os títulos `一` e `二` do artista `東京`, permaneceram visíveis sem reescrever os IDs salvos.
- Falhas 404 de miniatura, falha/retentativa de recomendações, falha parcial, exclusão sem confirmação de rede e permissão de clipboard negada foram exercitadas com dados sintéticos.

As APIs externas e o adaptador do YouTube foram simulados nos testes de navegador. O áudio WAV local usado nas regressões de reprodução é real no Chromium. O teste Windows ignorado verifica bloqueio de arquivo pelo sistema operacional; sua simulação multiplataforma passou. Não houve teste do aplicativo Windows instalado, publicação de instalador ou atualização nesta etapa. A checagem automatizada de acessibilidade não substitui validação humana com leitor de tela.

## Detalhes de compatibilidade

O slot de atualizações continua montado: o script Tauri injeta seu botão uma única vez. A busca mantém seus campos e resultados ao navegar. O histórico, a seleção da biblioteca, favoritos, coleção e as chaves de armazenamento foram preservados. As imagens defeituosas não provocam exclusão de músicas ou alteração do arquivo de áudio.

A paginação da biblioteca é feita no frontend; o conjunto de dados permanece disponível para pesquisa e reprodução. As consultas necessárias para os cards da Home e a identificação de áudio local do player continuam existindo. Não se trata de paginação HTTP do backend.

Os previews antigos estão montados, mas ocultos no desenho atual do player. O teste os expõe somente para verificar o fallback compartilhado; a interface não foi redesenhada para torná-los visíveis.

## Código e testes principais

- `features/DiscoveryPage.tsx` e `tests/browser/discovery-latest.cjs`.
- `hooks/useFocusScope.ts`, `player/useDismissiblePanel.ts` e `tests/browser/frontend-focus.cjs`.
- `components/RetainedArea.tsx`, `library/LocalLibrary.tsx` e `tests/browser/library-pagination.cjs`.
- `features/ListeningStatsPage.tsx`, `App.tsx` e `tests/browser/frontend-action-errors.cjs`.
- `utils/album-identity.ts`, `tests/album-identity.test.mjs` e `tests/browser/saved-album-editions.cjs`.
- `styles.css`, semântica dos componentes e `tests/browser/frontend-accessibility.cjs`.
- `player/PlayerArtwork.tsx` e `tests/browser/player-artwork-fallback.cjs`.

As suítes foram incluídas em `.github/workflows/desktop-release.yml`, com Playwright e axe-core fixados para a checagem. Instruções de execução estão em [tests/browser/README.md](../tests/browser/README.md).

[Logs e resultados estruturados](audits/frontend-correcoes-2026-10-23/README.md).

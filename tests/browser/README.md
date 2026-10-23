# Regressões no navegador

Para executar todas as suítes com o mesmo diagnóstico da publicação, use `python desktop/scripts/run_browser_checks.py`, com o frontend em execução. Cada arquivo `.cjs` desta pasta é uma suíte executável. Uma falha interrompe as demais, preserva o código de saída e inclui o nome da suíte e o erro nas anotações e no resumo do GitHub Actions.

Com o frontend em execução (`npm --prefix doomvault run dev -- --host 127.0.0.1`):

```sh
npm --prefix doomvault install --no-save --package-lock=false playwright@1.62.1 axe-core@4.14.0
npm --prefix doomvault exec -- playwright install chromium
node tests/browser/online-player-recovery.cjs
```

Para usar um Chromium já instalado:

```sh
CHROMIUM_PATH=/usr/bin/chromium node tests/browser/online-player-recovery.cjs
```

`BZTUNE_BASE_URL` permite mudar a URL do frontend. O teste usa um contexto novo com dados sintéticos e intercepta a API local e o adaptador do YouTube. Não requer o backend e não altera a biblioteca pessoal. Confere erro visível, clique real na recuperação (incluindo sobreposição de avisos), recarga do adaptador e preservação da versão Studio quando só há Live na biblioteca. Não mede reprodução real do provedor.

Os testes unitários continuam independentes do Playwright: `node --test tests/*.test.mjs`.

## Letras LRCLIB

Com o frontend em execução, execute:

```sh
CHROMIUM_PATH=/usr/bin/chromium node tests/browser/lyrics-regression.cjs
```

Sem `CHROMIUM_PATH`, usa o Chromium instalado pelo Playwright. Valida o player React com respostas simuladas do LRCLIB e do YouTube: concorrência entre importação e busca, preservação do LRC manual, seleção da fonte, restauração offline, falhas, arquivo inválido, duração da faixa e resposta após troca de música. Não consulta provedores reais.

## Relógio das letras

```sh
CHROMIUM_PATH=/usr/bin/chromium node tests/browser/lyrics-clock.cjs
```

Com o frontend em execução, verifica a frequência maior de leitura com letras visíveis, pausa/buffering, seek para frente e para trás, troca A→B→A antes do novo player ficar pronto e frequência reduzida no mini-player. O YouTube é um adaptador controlado. A parte local usa WAV silencioso reproduzido pelo navegador para conferir preservação da posição no crossfade e reinício em repetição de uma faixa. Esses testes não medem alinhamento de voz nem latência real do YouTube.

O teste `lyrics-clock.cjs` também verifica os botões de ajuste em 100 ms, o destaque resultante, a posição inalterada do áudio, persistência após recarga, isolamento entre músicas e fontes manual/LRCLIB e restauração para zero. Os testes unitários de letras conferem a composição com `[offset:...]`; os de backup validam limites e formatos antes da gravação.

Os testes de letras também verificam original e tradução com o mesmo timestamp no bloco ativo, preservação de `[refrão]`/`[echo]`, quebras de linha visíveis e manutenção do ajuste de sincronização. O fluxo de importação manual e a resposta simulada do LRCLIB usam o parser real do frontend.

`lyrics-regression.cjs` verifica também o posicionamento do bloco ativo após redimensionamento, ocultação da fila e alteração do tamanho da fonte; suspensão por mouse, clique e teclado; preservação da leitura manual; retomada do acompanhamento; reinício ao trocar música ou fonte, inclusive para texto simples e introdução; e ausência de animação com movimento reduzido. Espaço com foco na letra não altera a reprodução.

A suíte `lyrics-regression.cjs` também cobre a escolha explícita de gravação: lista ordenada por proximidade de duração, álbum e tipo de letra visíveis, seleção sincronizada e simples, restauração da versão salva após recarga, preservação do LRC manual, fechar a lista sem trocar a letra, busca vazia, erro e resposta atrasada após mudar a música. Os candidatos são respostas simuladas do novo endpoint `/api/lyrics/search`.

`lyrics-clock.cjs` verifica também a navegação por verso via clique, Enter e Espaço, com ajuste manual aplicado uma única vez, manutenção de pausa/reprodução, retomada do acompanhamento e erro de seek sem posição fictícia. Confere versos desativados durante troca de faixa, busca no áudio WAV real, verso além da duração desativado e cancelamento de um crossfade em preparação ou em andamento antes de voltar ao verso. `lyrics-regression.cjs` garante que texto simples continue sem destinos de seek.

Os controles da letra também são verificados em `lyrics-regression.cjs`: busca manual dentro do menu, indicação da fonte selecionada, abertura por Enter, primeiro Esc fechando somente as opções, segundo Esc minimizando o player, retorno de foco, fechamento ao clicar ou focar fora e menu dentro da janela em três tamanhos. Para salvar PNGs do player com o menu aberto e fechado, use `BZTUNE_LYRICS_PREVIEW_DIR=/tmp/bztune-lyrics-preview` ao executar essa suíte; ela usa somente os dados fictícios do teste.

`lyrics-auto-lookup.cjs` reproduz falha da consulta exata seguida de busca de versões bem-sucedida, com seleção automática de remaster compatível sem abrir opções. Também verifica apresentação direta de versões incompatíveis, metadados recebidos durante a consulta, prioridade de importação manual durante a espera inicial e descarte de resposta após troca de faixa. O workflow de instalador assinado executa essa suíte junto das regressões anteriores.


## Auditoria de frontend F04–F10

- `discovery-latest.cjs`: consultas atrasadas de rádio e perfis não substituem a consulta atual.
- `frontend-focus.cjs`: foco inicial, Tab/Shift+Tab, Escape, fundo inerte e retorno de foco em editores, player e menu móvel.
- `library-pagination.cjs`: 1.500 músicas, até 50 linhas por página nas três visualizações, nenhuma linha oculta, estado preservado e fila completa ao reproduzir.
- `frontend-action-errors.cjs`: falha e recuperação de recomendações, erro de exclusão do histórico e permissão de clipboard negada.
- `saved-album-editions.cjs`: IDs distintos e nomes Unicode permanecem em Favoritos/Coleção.
- `frontend-accessibility.cjs`: axe-core 4.14.0, regras WCAG 2 A/AA e 2.1 A/AA, em 20 cenários de abas/temas/player/editor. `BZTUNE_A11Y_RESULTS` grava o JSON do resultado. Não substitui teste humano com leitor de tela.
- `player-artwork-fallback.cjs`: 404 nas miniaturas, capas válidas e ausência de novas tentativas por simples rerender. Os previews antigos, ocultos no layout atual, são expostos somente dentro do teste para exercitar seu fallback compartilhado.

As suítes estão incluídas no workflow de release. Os provedores são simulados e os testes não manipulam músicas pessoais.

# Regressões no navegador

Com o frontend em execução (`npm --prefix doomvault run dev -- --host 127.0.0.1`):

```sh
npm --prefix doomvault install --no-save --package-lock=false playwright
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

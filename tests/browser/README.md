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

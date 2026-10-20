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

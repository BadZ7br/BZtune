# Regressão visual desktop

Com a prévia desktop em 127.0.0.1:5173 e Playwright 1.62.1 instalado:

```sh
CHROMIUM_PATH=/usr/bin/chromium node doomvault/node_modules/playwright/cli.js test --config tests/visual/playwright.config.cjs
```

Compara PNGs reais e guarda atual/esperado/diferença em `artifacts/desktop-visual-results` quando falha. Casos iniciais: Início dark/midnight/light e Biblioteca. API e YouTube são controlados pela fixture, com dados sintéticos. Animações são desabilitadas; tolerância de 0,5% de pixels diferentes.

Referências iniciais: Linux Debian 13, Chromium do ambiente, viewport 1360×870. Use o mesmo sistema, fontes e navegador para comparação confiável. Snapshots por plataforma evitam comparar Windows diretamente com Linux; distribuição/fontes distintas ainda podem exigir referências próprias. Não atualizar referências automaticamente em release.

Para uma atualização visual intencional, execute com `--update-snapshots`, revise os PNGs e então execute novamente sem essa opção. Não foi integrado como gate Windows: falta gerar/revisar referências no runner Windows. As suítes existentes de layout, foco e WCAG continuam obrigatórias na publicação.

const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const frontendRequire = createRequire(path.resolve(__dirname, '../../doomvault/package.json'));
const { chromium } = frontendRequire('playwright');
const { fixture } = require('./frontend-contracts.cjs');

async function scan(page, name) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations()
      .filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime))
      .map(a => a.finished.catch(() => {})));
  });
  if (!await page.evaluate(() => !!window.axe)) {
    await page.addScriptTag({ path: frontendRequire.resolve('axe-core/axe.min.js') });
  }
  const violations = await page.evaluate(async () => (await axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
  assert.deepEqual(violations, [], name);
  console.log(`PASS WCAG ${name}`);
}

(async () => {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox'],
  });
  try {
    for (const [theme, width] of [['dark', 1360], ['midnight', 960], ['light', 390]]) {
      const f = await fixture(browser, { theme, width });
      const p = f.page;
      await p.getByRole('button', { name: 'Expandir player', exact: true }).click();
      await p.getByRole('region', { name: 'Letras da música', exact: true }).waitFor();
      await scan(p, `${theme} player Letra`);
      for (const tool of ['Fila', 'Equalizador', 'Histórico', 'Crossfade', 'Baixar', 'Mais']) {
        await p.getByRole('toolbar', { name: 'Ferramentas do player expandido' })
          .getByRole('button', { name: tool, exact: true }).click();
        await scan(p, `${theme} player ${tool}`);
      }
      assert.deepEqual(f.errors, []);
      await p.close();
    }
    const f = await fixture(browser, { tab: 'search', override: async (route, url) => {
      if (url.pathname !== '/api/artists') return;
      await route.fulfill({ json: { results: [
        { id: 'artist1', name: 'Artista de Teste', image: null },
        { id: 'artist2', name: 'Artista de Teste', image: null },
      ] } });
      return true;
    } });
    const p = f.page;
    await p.getByRole('textbox', { name: 'Pesquisar música', exact: true }).fill('teste');
    await p.locator('.us-artist').first().click();
    await p.locator('.ap-card').first().waitFor();
    await scan(p, 'Artista com homônimos');
    await p.locator('.ap-card').first().locator('.ap-open').click();
    await p.getByRole('heading', { name: 'Faixas', exact: true }).waitFor();
    await scan(p, 'Detalhes de álbum');
    assert.deepEqual(f.errors, []);
    await p.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

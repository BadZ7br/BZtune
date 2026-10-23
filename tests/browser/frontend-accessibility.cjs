const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const frontendRequire = createRequire(path.resolve(__dirname, '../../doomvault/package.json'));
const { chromium } = frontendRequire('playwright');
const { fixture } = require('./frontend-contracts.cjs');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const results = [];
  try {
    const cases = ['home', 'search', 'categories', 'discovery', 'recommendations', 'library', 'collection', 'favorites', 'playlists', 'stats', 'maintenance', 'system'].map(tab => [tab, 'dark', 1360]);
    cases.push(['home', 'midnight', 1360], ['system', 'midnight', 1360], ['home', 'light', 390], ['system', 'light', 390],
      ['home', 'dark', 1360, 'player'], ['home', 'midnight', 960, 'player'], ['home', 'light', 390, 'player'], ['library', 'dark', 1360, 'editor']);
    for (const [tab, theme, width, overlay] of cases) {
      const f = await fixture(browser, { tab, theme, width });
      const p = f.page;
      if (overlay === 'player') await p.getByRole('button', { name: 'Expandir player', exact: true }).click();
      if (overlay === 'editor') {
        await p.getByRole('button', { name: 'Faixas', exact: true }).click();
        await p.getByRole('button', { name: 'Editar metadados de Faixa Local 1', exact: true }).click();
      }
      await p.addScriptTag({ path: frontendRequire.resolve('axe-core/axe.min.js') });
      const violations = await p.evaluate(async () => (await axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })));
      results.push({ tab, theme, width, overlay, violations });
      console.log(`${violations.length ? 'FAIL' : 'PASS'} WCAG ${tab} ${theme} ${width}px ${overlay || ''}`);
      if (violations.length) console.log(JSON.stringify(violations));
      assert.deepEqual(f.errors, []);
      await p.close();
    }
  } finally {
    await browser.close();
    if (process.env.BZTUNE_A11Y_RESULTS) fs.writeFileSync(process.env.BZTUNE_A11Y_RESULTS, JSON.stringify(results, null, 2));
  }
  assert.deepEqual(results.filter(r => r.violations.length), [], 'axe WCAG violations must be resolved');
})().catch(e => { console.error(e); process.exitCode = 1; });

const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(__dirname, '../../doomvault/package.json'))('playwright');
const { fixture } = require('./frontend-contracts.cjs');
const cases = [];

cases.push(['V01', async browser => {
  const track = { id: 'one', title: 'Possível repetida', artist: 'Artista', album: '', year: null,
    trackNumber: null, filename: 'demo.mp3', bytes: 100, mime: 'audio/mpeg',
    coverUrl: '/cover/one', audioUrl: '/audio/one', signals: [] };
  const report = { count: 2, warning: 'A comparação não apaga arquivos.',
    summary: { identical: 0, possible: 1, versions: 0 },
    groups: [{ id: 'group', kind: 'possible', confidence: 'review', reason: 'Revisar gravações.',
      tracks: [track, { ...track, id: 'two' }] }] };
  let response = { groups: [] };
  const f = await fixture(browser, { tab: 'library', override: async (route, url) => {
    if (url.pathname !== '/api/library/duplicates') return;
    await route.fulfill({ json: response }); return true;
  } });
  const p = f.page, panel = p.getByRole('region', { name: 'Detector de duplicatas' });
  await p.getByRole('button', { name: 'Analisar duplicatas', exact: true }).click();
  await panel.getByRole('alert').filter({ hasText: 'Resposta inválida' }).waitFor();
  assert.equal(await p.getByRole('alert', { name: 'Falha em Biblioteca' }).count(), 0);
  response = report;
  await panel.getByRole('button', { name: 'Analisar novamente', exact: true }).click();
  await panel.locator('.ll-dupes-group').waitFor();
  response = { ...report, groups: [{ ...report.groups[0], tracks: [{ ...track, signals: null }] }] };
  await panel.getByRole('button', { name: 'Analisar novamente', exact: true }).click();
  await panel.getByRole('alert').waitFor();
  assert.equal(await panel.locator('.ll-dupes-track').count(), 2);
  assert.equal(await p.getByRole('button', { name: 'Expandir player', exact: true }).isVisible(), true);
  assert.deepEqual(f.errors, []); await p.close();
}]);

cases.push(['V02', async browser => {
  let failed = true;
  const f = await fixture(browser, { tab: 'maintenance', override: async (route, url) => {
    if (url.pathname.endsWith('/maintenance/diagnostics') && failed) {
      await route.fulfill({ status: 503, json: { error: 'offline' } }); return true;
    }
  } });
  const p = f.page;
  await p.getByRole('alert').filter({ hasText: 'API indisponível' }).waitFor();
  failed = false;
  await p.getByRole('button', { name: 'Recarregar diagnóstico', exact: true }).click();
  await p.locator('.bz-diagnostics').waitFor();
  assert.equal(await p.getByRole('alert').count(), 0);
  failed = true;
  await p.getByRole('button', { name: 'Recarregar diagnóstico', exact: true }).click();
  await p.getByRole('alert').filter({ hasText: 'última consulta' }).waitFor();
  assert.equal(await p.locator('.bz-diagnostics').isVisible(), true);
  await p.locator('input[accept=".json,application/json"]').setInputFiles({
    name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{'),
  });
  const backupError = await p.locator('.bz-feat-root > [role=alert]').first().innerText();
  failed = false;
  await p.getByRole('button', { name: 'Recarregar diagnóstico', exact: true }).click();
  await p.getByRole('button', { name: 'Recarregar diagnóstico', exact: true }).isEnabled();
  await p.getByRole('alert').filter({ hasText: 'API indisponível' }).waitFor({ state: 'hidden' });
  assert.equal(await p.getByRole('alert').innerText(), backupError);
  assert.deepEqual(f.errors, []); await p.close();
}]);

(async () => {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'],
  });
  try {
    for (const [id, run] of cases) {
      if (process.env.BZTUNE_VISUAL_CASE && process.env.BZTUNE_VISUAL_CASE !== id) continue;
      await run(browser); console.log(`PASS ${id}`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

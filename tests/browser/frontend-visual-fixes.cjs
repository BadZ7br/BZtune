const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(__dirname, '../../doomvault/package.json'))('playwright');
const { fixture } = require('./frontend-contracts.cjs');
const cases = [];
async function checkAxe(page, rules) {
  const frontendRequire = createRequire(path.resolve(__dirname, '../../doomvault/package.json'));
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime))
      .map(a => a.finished.catch(() => {})));
  });
  if (!await page.evaluate(() => !!window.axe)) await page.addScriptTag({ path: frontendRequire.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async rules => (await axe.run(document, {
    runOnly: { type: 'rule', values: rules },
  })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), rules);
  assert.deepEqual(violations, []);
}

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

cases.push(['V03', async browser => {
  const job = { id: 'job', filename: 'Minha transferência.mp3', status: 'downloading',
    downloaded: 50, total: 100, duplicate: false, error: null };
  let mode = 'valid';
  const f = await fixture(browser, { tab: 'library', override: async (route, url) => {
    if (url.pathname !== '/api/library/downloads') return;
    await route.fulfill(mode === 'offline' ? { status: 503, json: {} }
      : { json: mode === 'invalid' ? { jobs: [null] } : { jobs: [job] } });
    return true;
  } });
  const p = f.page, panel = p.locator('.dl-root');
  await panel.getByText(job.filename, { exact: true }).waitFor();
  for (const failure of ['offline', 'invalid']) {
    mode = failure;
    await panel.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: 'última consulta' }).waitFor();
    assert.equal(await panel.getByText(job.filename, { exact: true }).isVisible(), true);
    assert.equal(await panel.getByText('Nenhum download iniciado.', { exact: true }).count(), 0);
  }
  mode = 'valid'; job.status = 'complete'; job.downloaded = 100;
  await panel.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await panel.getByText('Concluído', { exact: true }).waitFor();
  await panel.getByRole('alert').waitFor({ state: 'hidden' });
  assert.deepEqual(f.errors, []); await p.close();
}]);

cases.push(['V04', async browser => {
  const lists = ['Primeira', 'Segunda'].map((name, i) => ({ id: 'playlist'+i, name,
    description: '', created_at: '2026-01-01', count: 0, coverUrl: null, tracks: [] }));
  const f = await fixture(browser, { override: async (route, url) => {
    if (url.pathname !== '/api/playlists') return;
    await route.fulfill({ json: { playlists: lists } }); return true;
  } });
  const p = f.page;
  for (const name of ['Segunda', 'Primeira', 'Segunda']) {
    await p.locator('.dv-home-playlist').filter({ hasText: name }).click();
    await p.locator('.pl-hero-info').getByRole('heading', { name, exact: true }).waitFor();
    assert.equal(await p.locator('.pl-select.active strong').innerText(), name);
    // A manual selection must not override a later explicit Home request, even for the same ID.
    await p.locator('.pl-select').filter({ hasText: name === 'Primeira' ? 'Segunda' : 'Primeira' }).click();
    await p.locator('.sidebar').getByRole('button', { name: 'Início', exact: true }).click();
  }
  assert.deepEqual(f.errors, []); await p.close();
}]);

cases.push(['V05', async browser => {
  const albums = ['edition-a', 'edition-b'].map((id, i) => ({ id, title: 'Mesmo álbum',
    artist: 'Artista de Teste', year: 1990 + i * 20, cover: null }));
  for (const tab of ['collection', 'favorites', 'recommendations']) {
    const requests = [];
    const f = await fixture(browser, { tab, seed: {
      'doomvault-api-albums': JSON.stringify(albums),
      'doomvault-collection': JSON.stringify(albums.map(a => a.id)),
      'doomvault-favorites': JSON.stringify(albums.map(a => a.id)),
    }, override: async (route, url) => {
      if (url.pathname === '/api/albums') {
        await route.fulfill({ json: { results: albums } }); return true;
      }
      if (url.pathname === '/api/library/auto-download') {
        requests.push(route.request().postDataJSON());
        await route.fulfill({ json: { id: 'batch-' + requests.length } }); return true;
      }
      if (url.pathname.startsWith('/api/library/auto-download/')) {
        await route.fulfill({ json: { id: url.pathname.split('/').pop(), status: 'complete',
          total: 0, completed: 0, errors: [] } }); return true;
      }
    } });
    const p = f.page;
    for (let i = 0; i < 2; i++) {
      await p.locator('.dv-grid .dv-card').nth(i)
        .getByRole('button', { name: 'Baixar lançamento: Mesmo álbum', exact: true }).click();
    }
    await p.getByRole('button', { name: 'Download concluído: Mesmo álbum', exact: true }).nth(1).waitFor();
    assert.deepEqual(requests.map(request => request.albumId), albums.map(a => a.id), tab);
    assert.deepEqual(f.errors, []); await p.close();
  }
}]);

cases.push(['V06', async browser => {
  let f = await fixture(browser, { override: async (route, url) => {
    if (!['/api/library/tracks', '/api/playlists'].includes(url.pathname)) return;
    await route.fulfill({ status: 503, json: {} }); return true;
  } });
  await f.page.getByRole('button', { name: 'Tentar novamente: carregar biblioteca', exact: true }).waitFor();
  await f.page.getByRole('button', { name: 'Tentar novamente: carregar playlists', exact: true }).waitFor();
  await checkAxe(f.page, ['label-content-name-mismatch']); await f.page.close();
  f = await fixture(browser);
  await f.page.getByRole('button', { name: 'Mais opções de Faixa Local 1', exact: true }).click();
  await f.page.getByRole('menuitem', { name: 'Tocar a seguir: Faixa Local 1', exact: true }).waitFor();
  await checkAxe(f.page, ['label-content-name-mismatch']);
  await f.page.keyboard.press('Escape');
  await f.page.getByRole('button', { name: 'Expandir player', exact: true }).click();
  await f.page.getByLabel('Opções da letra', { exact: true }).click();
  await f.page.getByRole('button', { name: 'Buscar novamente no LRCLIB', exact: true }).waitFor();
  await checkAxe(f.page, ['label-content-name-mismatch']);
  assert.deepEqual(f.errors, []); await f.page.close();
  f = await fixture(browser, { seed: { 'doomvault-player-state-v11': JSON.stringify({
    tracks: [{ videoId: 'library:local1', title: 'Faixa Local 1', artist: 'Artista de Teste',
      audioUrl: 'http://127.0.0.1:5000/audio/local1' }], index: 0, shuffle: false, repeat: 'off',
  }) } });
  await f.page.getByRole('button', { name: 'Expandir player', exact: true }).click();
  await f.page.getByRole('toolbar', { name: 'Ferramentas do player expandido' })
    .getByRole('button', { name: 'Mais', exact: true }).click();
  await f.page.getByRole('button', { name: 'Escolher playlist para Faixa Local 1', exact: true }).waitFor();
  await checkAxe(f.page, ['label-content-name-mismatch']);
  assert.deepEqual(f.errors, []); await f.page.close();
}]);

cases.push(['V07', async browser => {
  const history = Array.from({ length: 30 }, (_, i) => ({ id: 'listen' + i,
    title: 'Música ouvida ' + i, artist: 'Artista', album: 'Álbum', source: 'local',
    seconds: 120, started_at: '2026-10-28T12:00:00Z' }));
  for (const [theme, width] of [['dark', 1360], ['midnight', 960], ['light', 390]]) {
    const f = await fixture(browser, { tab: 'stats', theme, width, override: async (route, url) => {
      if (!url.pathname.endsWith('/stats/summary')) return;
      await route.fulfill({ json: { totals: { seconds: 3600, plays: 30, tracks: 30, artists: 1 },
        artists: [], tracks: [], albums: [], daily: [], history } }); return true;
    } });
    const p = f.page, region = p.getByRole('region', { name: 'Histórico de escuta', exact: true });
    await region.waitFor();
    await p.getByRole('button', { name: 'Limpar', exact: true }).focus();
    await p.keyboard.press('Tab');
    assert.equal(await region.evaluate(e => e === document.activeElement), true);
    assert.notEqual(await region.evaluate(e => getComputedStyle(e).outlineStyle), 'none');
    await p.keyboard.press('PageDown');
    await p.waitForFunction(() => document.querySelector('.bz-history').scrollTop > 0);
    await checkAxe(p, ['scrollable-region-focusable']);
    await p.keyboard.press('Tab');
    assert.equal(await region.evaluate(e => e === document.activeElement), false);
    assert.deepEqual(f.errors, []); await p.close();
  }
}]);

cases.push(['V08', async browser => {
  for (const [theme, width] of [['dark', 1360], ['midnight', 960], ['light', 390]]) {
    const f = await fixture(browser, { tab: 'search', theme, width, override: async (route, url) => {
      if (url.pathname !== '/api/artists') return;
      await route.fulfill({ json: { results: [
        { id: 'artist1', name: 'Artista de Teste', image: null },
        { id: 'artist2', name: 'Artista de Teste', image: null },
      ] } }); return true;
    } });
    const p = f.page;
    await p.getByRole('textbox', { name: 'Pesquisar música', exact: true }).fill('teste');
    await p.locator('.us-artist').first().click();
    await p.locator('.ap-homonym-tabs small').first().waitFor();
    for (const filter of ['Todas', 'Álbuns', 'Singles', 'EPs', 'Outros']) {
      await p.getByRole('group', { name: 'Filtrar lançamentos' })
        .getByRole('button', { name: new RegExp('^' + filter) }).click();
      await checkAxe(p, ['color-contrast']);
    }
    assert.deepEqual(f.errors, []); await p.close();
  }
}]);

cases.push(['V09', async browser => {
  async function toggleAndCheck(p, root, label, key) {
    const button = root.getByRole('button', { name: label, exact: true });
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await p.evaluate(key => JSON.parse(localStorage.getItem(key)), key), []);
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await p.evaluate(key => JSON.parse(localStorage.getItem(key)), key), ['album1']);
  }
  const favorite = 'Favoritar álbum: Álbum de Teste', collection = 'Adicionar álbum à coleção: Álbum de Teste';
  for (const [tab, label, key] of [
    ['collection', favorite, 'doomvault-favorites'],
    ['favorites', collection, 'doomvault-collection'],
    ['recommendations', favorite, 'doomvault-favorites'],
  ]) {
    const f = await fixture(browser, { tab });
    await f.page.locator('.dv-card').first().waitFor();
    await toggleAndCheck(f.page, f.page.locator('.dv-card').first(), label, key);
    assert.deepEqual(f.errors, []); await f.page.close();
  }
  const f = await fixture(browser, { tab: 'search' });
  const p = f.page;
  await p.getByRole('textbox', { name: 'Pesquisar música', exact: true }).fill('teste');
  await p.locator('.us-card').first().waitFor();
  await toggleAndCheck(p, p.locator('.us-card').first(), favorite, 'doomvault-favorites');
  await toggleAndCheck(p, p.locator('.us-card').first(), collection, 'doomvault-collection');
  await p.locator('.us-artist').first().click();
  await p.locator('.ap-card').first().waitFor();
  await toggleAndCheck(p, p.locator('.ap-card').first(), favorite, 'doomvault-favorites');
  await toggleAndCheck(p, p.locator('.ap-card').first(), collection, 'doomvault-collection');
  assert.deepEqual(f.errors, []); await p.close();
}]);

cases.push(['V10', async browser => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="orange"/></svg>';
  let recovered = false, imageRequests = 0;
  const f = await fixture(browser, { seed: {
    'doomvault-api-albums': JSON.stringify([{ id: 'album1', title: 'Álbum de Teste',
      artist: 'Artista de Teste', year: 2024, cover: 'https://example.org/test.png' }]),
  }, override: async (route, url) => {
    if (url.pathname.includes('/cover')) {
      imageRequests++;
      await route.fulfill(recovered ? { contentType: 'image/svg+xml', body: svg } : { status: 404, body: '' });
      return true;
    }
    if (url.pathname === '/api/library/tracks') {
      await route.fulfill({ json: { tracks: [{ id: 'local1', title: 'Faixa Local 1',
        artist: 'Artista de Teste', audioUrl: '/audio/local1', coverUrl: '/cover/track' }] } }); return true;
    }
    if (url.pathname === '/api/playlists') {
      await route.fulfill({ json: { playlists: [{ id: 'p', name: 'Playlist com capa',
        description: '', created_at: '2026-01-01', count: 0, tracks: [], coverUrl: '/cover/playlist' }] } }); return true;
    }
  } });
  const p = f.page;
  const wrappers = ['.dv-home-tile-art', '.dv-home-playlist-art', '.dv-home-album-art'];
  for (const selector of wrappers) {
    await p.locator(selector).scrollIntoViewIfNeeded();
    await p.locator(selector + ' .bz-safe-fallback').waitFor();
  }
  assert.equal(await p.locator('.dv-home img').count(), 0);
  const before = imageRequests;
  const volume = p.getByRole('group', { name: 'Mini-player do BZtune' }).getByRole('slider', { name: 'Volume', exact: true });
  await volume.focus(); await volume.press('Home'); await volume.press('End');
  assert.equal(imageRequests, before, 'ordinary renders must not retry broken covers');
  recovered = true;
  await p.locator('.sidebar').getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await p.locator('.sidebar').getByRole('button', { name: 'Início', exact: true }).click();
  for (const selector of wrappers) {
    await p.locator(selector).scrollIntoViewIfNeeded();
    await p.waitForFunction(selector => document.querySelector(selector + ' img')?.naturalWidth > 0, selector);
  }
  assert.equal(await p.locator('.dv-home .bz-safe-fallback').count(), 0);
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

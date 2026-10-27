const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(__dirname, '../../doomvault/package.json'))('playwright');
const { fixture } = require('./frontend-contracts.cjs');

(async () => {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox'],
  });
  try {
    const album = { id: 'compilation', title: 'Coletânea', artist: 'Vários artistas', cover: null, year: 2020 };
    // The legacy API supplies only artists[]; both contracts must remain usable.
    for (const credit of [{ artists: ['Artista da faixa', 'Convidado'] },
      { artist: 'Artista da faixa, Convidado', artists: ['Artista da faixa', 'Convidado'] }]) {
      const f = await fixture(browser, {
        tab: 'collection',
        seed: { 'doomvault-api-albums': JSON.stringify([album]), 'doomvault-collection': JSON.stringify([album.id]) },
        override: async (route, url) => {
          if (url.pathname !== '/api/albums/compilation') return;
          await route.fulfill({ json: { title: album.title, tracks: [
            { video_id: 'abcdefghijk', title: 'Faixa individual', ...credit },
          ] } });
          return true;
        },
      });
      const p = f.page;
      await p.locator('.dv-card .dv-art-click').first().click();
      const track = p.getByRole('button', { name: 'Reproduzir Faixa individual Artista da faixa, Convidado', exact: true });
      await track.waitFor();
      assert.equal(await track.locator('small').innerText(), 'Artista da faixa, Convidado');
      await track.click();
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('doomvault-player-state-v11')).tracks[0].artist === 'Artista da faixa, Convidado');
      const current = await p.evaluate(() => JSON.parse(localStorage.getItem('doomvault-player-state-v11')).tracks[0]);
      assert.equal(current.album, 'Coletânea');
      assert.equal(current.albumId, 'compilation');
      assert.deepEqual(f.errors, []);
      await p.close();
    }
    console.log('PASS compilation performer survives API contract, visible credits and playback queue');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

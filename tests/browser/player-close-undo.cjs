const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { chromium } = createRequire(path.resolve(__dirname, '../../doomvault/package.json'))('playwright');
const { fixture } = require('./frontend-contracts.cjs');
const wav = Buffer.alloc(44 + 8000 * 8 * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  try {
    for (const [theme, width, local] of [['midnight', 1360, false], ['light', 320, true]]) {
      const tracks = [
        { videoId: local ? 'library:local1' : 'abcdefghijk', title: 'Faixa de Teste', artist: 'Artista de Teste' },
        { videoId: local ? 'library:local2' : 'lmnopqrstuv', title: 'Outra faixa', artist: 'Artista' },
      ].map((track, i) => local ? { ...track, audioUrl: `http://127.0.0.1:5000/audio/local${i + 1}` } : track);
      const f = await fixture(browser, { width, theme, seed: {
        'doomvault-player-state-v11': JSON.stringify({ tracks, index: 1, shuffle: true, repeat: 'all' }),
      }, override: async (route, url) => {
        if (url.pathname.startsWith('/audio/')) { await route.fulfill({ contentType: 'audio/wav', body: wav }); return true; }
      } });
      const p = f.page;
      const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('doomvault-player-state-v11')));
      const before = await state();
      await p.getByRole('button', { name: 'Expandir player', exact: true }).click();
      const footer = p.getByRole('toolbar', { name: 'Ferramentas do player expandido' });
      const close = footer.getByRole('button', { name: 'Fechar player e limpar fila', exact: true });
      assert.match(await close.getAttribute('title'), /limpar fila/);
      await p.getByRole('button', { name: 'Reproduzir', exact: true }).click();
      if (local) await p.waitForFunction(() => [...document.querySelectorAll('audio')].some(a => !a.paused));
      await close.click();
      const notice = p.getByRole('status', { name: 'Fila removida' });
      const undo = notice.getByRole('button', { name: 'Desfazer', exact: true });
      await undo.waitFor();
      assert.equal((await state()).tracks.length, 0);
      assert.equal(await undo.evaluate(e => e === document.activeElement), true);
      const box = await notice.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'undo notice must fit the viewport');
      if (process.env.BZTUNE_UNDO_PREVIEW_DIR) {
        require('node:fs').mkdirSync(process.env.BZTUNE_UNDO_PREVIEW_DIR, { recursive: true });
        await p.screenshot({ path: path.join(process.env.BZTUNE_UNDO_PREVIEW_DIR, `undo-${theme}.png`) });
      }
      await undo.click();
      await p.getByRole('button', { name: 'Expandir player', exact: true }).waitFor();
      assert.deepEqual(await state(), before);
      assert.equal(await p.getByRole('button', { name: 'Reproduzir', exact: true }).count(), 1);
      await p.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Expandir player');
      if (local) assert.equal(await p.locator('audio').evaluateAll(es => es.every(e => e.paused)), true);
      await p.getByRole('button', { name: 'Fechar player e limpar fila', exact: true }).click();
      await p.locator('.bz-home-track .dv-home-tile').first().click();
      await p.getByRole('button', { name: 'Expandir player', exact: true }).waitFor();
      assert.equal(await notice.count(), 0, 'starting a new queue must discard the obsolete undo');
      assert.equal((await state()).tracks.length, 1);
      await p.getByRole('button', { name: 'Fechar player e limpar fila', exact: true }).click();
      await p.getByRole('button', { name: 'Fechar aviso de fila removida', exact: true }).click();
      assert.equal(await notice.count(), 0);
      assert.deepEqual(f.errors, []);
      await p.close();
      console.log(`PASS close/undo restores queue paused; retains focus; new queue discards undo; notice fits ${width}px ${theme} ${local ? 'local WAV' : 'online'}`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
